const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const databasePath = process.env.DATABASE_PATH || path.join(root, "data", "conecta-rhid.sqlite");
const dataDir = path.dirname(databasePath);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@conecta.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && ADMIN_PASSWORD === "admin123") {
  throw new Error("Defina ADMIN_PASSWORD antes de iniciar em produção.");
}

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    action TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    date TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL NOT NULL,
    location_json TEXT NOT NULL,
    photo TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    employee_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

seedEmployees();
cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, 1000 * 60 * 30);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${port}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.message || "Erro interno do servidor." });
  }
});

server.listen(port, () => {
  console.log(`Conecta RHiD em http://localhost:${port}`);
  console.log(`Banco de dados: ${databasePath}`);
});

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      app: "Conecta RHiD",
      database: fs.existsSync(databasePath),
      time: new Date().toISOString()
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    const mode = String(body.mode || "employee");
    const identifier = String(body.identifier || "").trim();
    const password = String(body.password || "");

    if (mode === "admin") {
      if (identifier.toLowerCase() !== ADMIN_EMAIL.toLowerCase() || !verifyPassword(password, hashPassword(ADMIN_PASSWORD))) {
        sendJson(response, 401, { error: "Login de administrador inválido." });
        return;
      }

      sendJson(response, 200, createSession({ type: "admin" }));
      return;
    }

    const employee = db.prepare("SELECT * FROM employees WHERE lower(code) = lower(?) AND active = 1").get(identifier);
    if (!employee || !verifyPassword(password, employee.password_hash)) {
      sendJson(response, 401, { error: "Código ou senha do funcionário inválidos." });
      return;
    }

    sendJson(response, 200, createSession({ type: "employee", employeeId: employee.id }));
    return;
  }

  const session = authenticate(request);
  if (!session) {
    sendJson(response, 401, { error: "Sessão inválida ou expirada." });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/logout") {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(session.token);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, getStateForSession(session));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/employees") {
    requireAdmin(session, response);
    if (response.writableEnded) return;
    const body = await readJson(request);
    sendJson(response, 200, { employee: saveEmployee(body) });
    return;
  }

  const employeeToggleMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/toggle$/);
  if (request.method === "PATCH" && employeeToggleMatch) {
    requireAdmin(session, response);
    if (response.writableEnded) return;
    const employee = toggleEmployee(employeeToggleMatch[1]);
    sendJson(response, 200, { employee });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/records") {
    const body = await readJson(request, 15 * 1024 * 1024);
    sendJson(response, 200, { record: saveRecord(session, body) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/export.csv") {
    requireAdmin(session, response);
    if (response.writableEnded) return;
    sendCsv(response);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/backup") {
    requireAdmin(session, response);
    if (response.writableEnded) return;
    sendJson(response, 200, getFullBackup());
    return;
  }

  sendJson(response, 404, { error: "Rota não encontrada." });
}

function serveStatic(requestPath, response) {
  const normalizedPath = requestPath === "/" ? "index.html" : requestPath.replace(/^[/\\]+/, "");
  const safePath = path.normalize(normalizedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root) || filePath.startsWith(dataDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...securityHeaders()
    });
    response.end(content);
  });
}

function seedEmployees() {
  const count = db.prepare("SELECT COUNT(*) AS total FROM employees").get().total;
  if (count > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO employees (id, name, role, code, password_hash, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);

  for (let index = 1; index <= 5; index++) {
    insert.run(
      crypto.randomUUID(),
      `Funcionário ${index}`,
      "Equipe",
      `CET-${String(index).padStart(3, "0")}`,
      hashPassword("123456"),
      now,
      now
    );
  }
}

function createSession({ type, employeeId = null }) {
  const token = crypto.randomBytes(32).toString("hex");
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 12);

  db.prepare(`
    INSERT INTO sessions (token, type, employee_id, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, type, employeeId, createdAt.toISOString(), expiresAt.toISOString());

  const user = type === "admin"
    ? { name: "Administrador", role: "Admin" }
    : employeeToClient(db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId));

  return { token, type, employeeId, user };
}

function authenticate(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;

  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) return null;

  if (new Date(session.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  return {
    token,
    type: session.type,
    employeeId: session.employee_id
  };
}

function cleanupExpiredSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(new Date().toISOString());
}

function requireAdmin(session, response) {
  if (session.type !== "admin") {
    sendJson(response, 403, { error: "Acesso restrito ao administrador." });
  }
}

function getStateForSession(session) {
  const employees = session.type === "admin"
    ? db.prepare("SELECT * FROM employees ORDER BY name").all()
    : db.prepare("SELECT * FROM employees WHERE id = ?").all(session.employeeId);

  const records = session.type === "admin"
    ? db.prepare("SELECT * FROM records ORDER BY timestamp").all()
    : db.prepare("SELECT * FROM records WHERE employee_id = ? ORDER BY timestamp").all(session.employeeId);

  return {
    employees: employees.map(employeeToClient),
    records: records.map(recordToClient)
  };
}

function getFullBackup() {
  return {
    exportedAt: new Date().toISOString(),
    employees: db.prepare("SELECT id, name, role, code, active, created_at, updated_at FROM employees ORDER BY name").all(),
    records: db.prepare("SELECT * FROM records ORDER BY timestamp").all().map(recordToClient)
  };
}

function saveEmployee(body) {
  const id = String(body.id || crypto.randomUUID());
  const name = String(body.name || "").trim();
  const role = String(body.role || "").trim();
  const code = String(body.code || "").trim();
  const password = String(body.password || "").trim();
  const now = new Date().toISOString();

  if (!name || !role || !code) {
    const error = new Error("Nome, cargo e código são obrigatórios.");
    error.status = 400;
    throw error;
  }

  const existing = db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
  if (existing) {
    const passwordHash = password ? hashPassword(password) : existing.password_hash;
    db.prepare(`
      UPDATE employees
      SET name = ?, role = ?, code = ?, password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(name, role, code, passwordHash, now, id);
  } else {
    if (!password) {
      const error = new Error("Senha é obrigatória para novo funcionário.");
      error.status = 400;
      throw error;
    }

    db.prepare(`
      INSERT INTO employees (id, name, role, code, password_hash, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(id, name, role, code, hashPassword(password), now, now);
  }

  return employeeToClient(db.prepare("SELECT * FROM employees WHERE id = ?").get(id));
}

function toggleEmployee(id) {
  const employee = db.prepare("SELECT * FROM employees WHERE id = ?").get(id);
  if (!employee) {
    const error = new Error("Funcionário não encontrado.");
    error.status = 404;
    throw error;
  }

  db.prepare("UPDATE employees SET active = ?, updated_at = ? WHERE id = ?")
    .run(employee.active ? 0 : 1, new Date().toISOString(), id);

  return employeeToClient(db.prepare("SELECT * FROM employees WHERE id = ?").get(id));
}

function saveRecord(session, body) {
  const employeeId = session.type === "admin" ? String(body.employeeId || "") : session.employeeId;
  const employee = db.prepare("SELECT * FROM employees WHERE id = ? AND active = 1").get(employeeId);
  if (!employee) {
    const error = new Error("Funcionário inválido.");
    error.status = 400;
    throw error;
  }

  const action = String(body.action || "");
  const actions = new Set(["entrada", "intervalo", "retorno", "saida"]);
  if (!actions.has(action)) {
    const error = new Error("Tipo de registro inválido.");
    error.status = 400;
    throw error;
  }

  const location = body.location || {};
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  const photo = String(body.photo || "");

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(accuracy) || !photo.startsWith("data:image/")) {
    const error = new Error("Foto e GPS são obrigatórios.");
    error.status = 400;
    throw error;
  }

  const now = new Date();
  const date = localDateKey(now);
  const dayRecords = db.prepare("SELECT * FROM records WHERE employee_id = ? AND date = ? ORDER BY timestamp")
    .all(employeeId, date)
    .map(recordToClient);

  if (!canPunch(action, dayRecords)) {
    const error = new Error(`Registro inválido agora. Status atual: ${nextStatus(dayRecords)}.`);
    error.status = 400;
    throw error;
  }

  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO records (
      id, employee_id, action, timestamp, date, latitude, longitude, accuracy, location_json, photo, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    employeeId,
    action,
    now.toISOString(),
    date,
    latitude,
    longitude,
    accuracy,
    JSON.stringify({ latitude, longitude, accuracy, capturedAt: location.capturedAt || now.toISOString() }),
    photo,
    now.toISOString()
  );

  return recordToClient(db.prepare("SELECT * FROM records WHERE id = ?").get(id));
}

function sendCsv(response) {
  const rows = [["Funcionário", "Código", "Data", "Tipo", "Horário", "Latitude", "Longitude", "Precisão GPS", "Foto registrada"]];
  const records = db.prepare(`
    SELECT records.*, employees.name, employees.code
    FROM records
    LEFT JOIN employees ON employees.id = records.employee_id
    ORDER BY records.timestamp
  `).all();

  records.forEach((record) => {
    rows.push([
      record.name || "Removido",
      record.code || "",
      record.date,
      actionLabel(record.action),
      record.timestamp,
      record.latitude,
      record.longitude,
      Math.round(record.accuracy),
      record.photo ? "Sim" : "Não"
    ]);
  });

  response.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"ponto-conecta-rhid.csv\""
  });
  response.end(rows.map((row) => row.map(csvCell).join(";")).join("\n"));
}

function employeeToClient(employee) {
  if (!employee) return null;
  return {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    code: employee.code,
    active: Boolean(employee.active),
    hasPassword: Boolean(employee.password_hash)
  };
}

function recordToClient(record) {
  let location;
  try {
    location = JSON.parse(record.location_json);
  } catch {
    location = {
      latitude: record.latitude,
      longitude: record.longitude,
      accuracy: record.accuracy
    };
  }

  return {
    id: record.id,
    employeeId: record.employee_id,
    action: record.action,
    timestamp: record.timestamp,
    date: record.date,
    location,
    photo: record.photo
  };
}

function localDateKey(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

function canPunch(action, records) {
  const last = records.length ? records[records.length - 1].action : null;
  const rules = {
    entrada: !last || last === "saida",
    intervalo: last === "entrada" || last === "retorno",
    retorno: last === "intervalo",
    saida: last === "entrada" || last === "retorno"
  };
  return Boolean(rules[action]);
}

function nextStatus(records) {
  const last = records.length ? records[records.length - 1].action : null;
  if (!last) return "Aguardando entrada";
  if (last === "entrada" || last === "retorno") return "Em expediente";
  if (last === "intervalo") return "Em intervalo";
  return "Jornada encerrada";
}

function actionLabel(action) {
  return {
    entrada: "Entrada",
    intervalo: "Intervalo",
    retorno: "Volta do intervalo",
    saida: "Saída"
  }[action] || action;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2$120000$${salt}$${derived}`;
}

function verifyPassword(password, hash) {
  if (String(hash).startsWith("pbkdf2$")) {
    const [, iterations, salt, derived] = String(hash).split("$");
    const candidate = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, "sha256").toString("hex");
    return safeEqual(candidate, derived);
  }

  const legacy = crypto.createHash("sha256").update(String(password)).digest("hex");
  return safeEqual(legacy, hash);
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

async function readJson(request, limit = 1024 * 1024) {
  let size = 0;
  const chunks = [];

  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("Payload muito grande.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders()
  });
  response.end(JSON.stringify(payload));
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()"
  };
}
