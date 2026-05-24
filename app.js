const SESSION_KEY = "conecta-rhid-session";
const SYNC_INTERVAL_MS = 30000;

let state = { employees: [], records: [] };
let currentSession = loadSession();
let syncTimer = null;

const elements = {
  loginScreen: document.querySelector("#loginScreen"),
  appShell: document.querySelector("#appShell"),
  loginForm: document.querySelector("#loginForm"),
  loginIdentifier: document.querySelector("#loginIdentifier"),
  loginPassword: document.querySelector("#loginPassword"),
  loginIdentifierLabel: document.querySelector("#loginIdentifierLabel"),
  currentDate: document.querySelector("#currentDate"),
  currentTime: document.querySelector("#currentTime"),
  currentDateLine: document.querySelector("#currentDateLine"),
  currentTimeLarge: document.querySelector("#currentTimeLarge"),
  employeeSelect: document.querySelector("#employeeSelect"),
  employeeSummary: document.querySelector("#employeeSummary"),
  todayRecords: document.querySelector("#todayRecords"),
  todayTotal: document.querySelector("#todayTotal"),
  todayTotalLarge: document.querySelector("#todayTotalLarge"),
  statusBadge: document.querySelector("#statusBadge"),
  cameraPreview: document.querySelector("#cameraPreview"),
  photoCanvas: document.querySelector("#photoCanvas"),
  cameraStatus: document.querySelector("#cameraStatus"),
  gpsStatus: document.querySelector("#gpsStatus"),
  startCameraButton: document.querySelector("#startCameraButton"),
  employeeCards: document.querySelector("#employeeCards"),
  employeeForm: document.querySelector("#employeeForm"),
  employeeId: document.querySelector("#employeeId"),
  employeeName: document.querySelector("#employeeName"),
  employeeRole: document.querySelector("#employeeRole"),
  employeeCode: document.querySelector("#employeeCode"),
  employeePassword: document.querySelector("#employeePassword"),
  clearFormButton: document.querySelector("#clearFormButton"),
  monthFilter: document.querySelector("#monthFilter"),
  reportTable: document.querySelector("#reportTable"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  backupButton: document.querySelector("#backupButton"),
  logoutButton: document.querySelector("#logoutButton"),
  userInitials: document.querySelector("#userInitials"),
  userName: document.querySelector("#userName"),
  userRole: document.querySelector("#userRole"),
  toast: document.querySelector("#toast")
};

let cameraStream = null;

const actionLabels = {
  entrada: "Entrada",
  intervalo: "Intervalo",
  retorno: "Volta do intervalo",
  saida: "Saída"
};

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(session) {
  currentSession = session;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  currentSession = null;
  sessionStorage.removeItem(SESSION_KEY);
}

function isAdmin() {
  return currentSession && currentSession.type === "admin";
}

function sessionEmployee() {
  if (!currentSession || currentSession.type !== "employee") return null;
  return state.employees.find((employee) => employee.id === currentSession.employeeId) || currentSession.user;
}

async function apiRequest(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  if (currentSession && currentSession.token) {
    headers.Authorization = `Bearer ${currentSession.token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers,
    body: options.body && typeof options.body !== "string" ? JSON.stringify(options.body) : options.body
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(payload.error || "Erro ao comunicar com o servidor.");
  }

  return payload;
}

async function refreshState() {
  const payload = await apiRequest("/api/state");
  state = payload;
}

function startAutoSync() {
  window.clearInterval(syncTimer);
  syncTimer = window.setInterval(async () => {
    if (!currentSession) return;
    try {
      await refreshState();
      renderAll();
    } catch {
      clearSession();
      applySessionView();
    }
  }, SYNC_INTERVAL_MS);
}

function stopAutoSync() {
  window.clearInterval(syncTimer);
  syncTimer = null;
}

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(minutes) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h${String(mins).padStart(2, "0")}`;
}

function selectedEmployee() {
  if (!isAdmin()) return sessionEmployee();
  return state.employees.find((employee) => employee.id === elements.employeeSelect.value);
}

function recordsForEmployeeDay(employeeId, day = todayKey()) {
  return state.records
    .filter((record) => record.employeeId === employeeId && record.date === day)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function calculateWorkedMinutes(records) {
  let total = 0;
  let openStart = null;

  records.forEach((record) => {
    if (record.action === "entrada" || record.action === "retorno") {
      openStart = new Date(record.timestamp);
    }

    if ((record.action === "intervalo" || record.action === "saida") && openStart) {
      total += (new Date(record.timestamp) - openStart) / 60000;
      openStart = null;
    }
  });

  return total;
}

function lastAction(records) {
  return records.length ? records[records.length - 1].action : null;
}

function nextStatus(records) {
  const last = lastAction(records);
  if (!last) return "Aguardando entrada";
  if (last === "entrada" || last === "retorno") return "Em expediente";
  if (last === "intervalo") return "Em intervalo";
  return "Jornada encerrada";
}

function canPunch(action, records) {
  const last = lastAction(records);
  const rules = {
    entrada: !last || last === "saida",
    intervalo: last === "entrada" || last === "retorno",
    retorno: last === "intervalo",
    saida: last === "entrada" || last === "retorno"
  };
  return Boolean(rules[action]);
}

function renderClock() {
  const now = new Date();
  elements.currentDate.textContent = formatDate(now);
  elements.currentTime.textContent = formatTime(now);
  elements.currentDateLine.textContent = formatDate(now);
  elements.currentTimeLarge.textContent = formatTime(now);
}

function renderEmployeesSelect() {
  const selectedId = elements.employeeSelect.value;
  elements.employeeSelect.innerHTML = "";

  const employees = isAdmin()
    ? state.employees.filter((employee) => employee.active)
    : [sessionEmployee()].filter(Boolean);

  employees.forEach((employee) => {
    const option = document.createElement("option");
    option.value = employee.id;
    option.textContent = `${employee.name} (${employee.code})`;
    elements.employeeSelect.append(option);
  });

  if (selectedId && employees.some((employee) => employee.id === selectedId)) {
    elements.employeeSelect.value = selectedId;
  } else if (employees[0]) {
    elements.employeeSelect.value = employees[0].id;
  }
}

function renderPointView() {
  const employee = selectedEmployee();
  if (!employee) {
    elements.employeeSummary.innerHTML = '<div class="empty-state">Cadastre um funcionário ativo.</div>';
    elements.todayRecords.innerHTML = '<div class="empty-state">Nenhum funcionário selecionado.</div>';
    return;
  }

  const records = recordsForEmployeeDay(employee.id);
  const workedMinutes = calculateWorkedMinutes(records);
  elements.statusBadge.textContent = nextStatus(records);
  elements.todayTotal.textContent = formatDuration(workedMinutes);
  elements.todayTotalLarge.textContent = formatDuration(workedMinutes);

  elements.employeeSummary.innerHTML = `
    <div class="metric">
      <span>Código</span>
      <strong>${escapeHtml(employee.code)}</strong>
    </div>
    <div class="metric">
      <span>Cargo</span>
      <strong>${escapeHtml(employee.role)}</strong>
    </div>
  `;

  elements.todayRecords.innerHTML = records.length
    ? records.map((record) => `
      <article class="record-row">
        ${record.photo ? `<img class="record-photo" src="${record.photo}" alt="Foto do registro">` : '<div class="record-photo" aria-hidden="true"></div>'}
        <div>
          <strong>${actionLabels[record.action]}</strong>
          <small>${formatDateTime(record.timestamp)}</small>
          <span class="record-meta">${formatLocation(record.location)}</span>
        </div>
        <span class="status-badge">${formatTime(new Date(record.timestamp))}</span>
      </article>
    `).join("")
    : '<div class="empty-state">Sem registros hoje.</div>';
}

function renderEmployeeCards() {
  elements.employeeCards.innerHTML = state.employees.map((employee) => `
    <article class="employee-card">
      <div>
        <strong>${escapeHtml(employee.name)}</strong>
        <small>${escapeHtml(employee.role)} · ${escapeHtml(employee.code)} · senha definida</small>
      </div>
      <div class="employee-card-actions">
        <button class="icon-button" data-edit="${employee.id}" title="Editar" type="button">✎</button>
        <button class="icon-button" data-toggle="${employee.id}" title="${employee.active ? "Inativar" : "Ativar"}" type="button">
          ${employee.active ? "✓" : "×"}
        </button>
      </div>
    </article>
  `).join("");
}

function renderReport() {
  if (!isAdmin()) return;
  const month = elements.monthFilter.value || monthKey();

  elements.reportTable.innerHTML = state.employees.map((employee) => {
    const records = state.records
      .filter((record) => record.employeeId === employee.id && record.date.startsWith(month))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const uniqueDays = new Set(records.map((record) => record.date)).size;
    const recordsByDay = records.reduce((grouped, record) => {
      grouped[record.date] = grouped[record.date] || [];
      grouped[record.date].push(record);
      return grouped;
    }, {});
    const totalMinutes = Object.values(recordsByDay).reduce((total, dayRecords) => {
      return total + calculateWorkedMinutes(dayRecords);
    }, 0);
    const lastRecord = records.length ? formatDateTime(records[records.length - 1].timestamp) : "-";
    const lastLocation = records.length ? formatLocationLink(records[records.length - 1].location) : "-";

    return `
      <tr>
        <td>${escapeHtml(employee.name)}</td>
        <td>${uniqueDays}</td>
        <td>${formatDuration(totalMinutes)}</td>
        <td>${lastRecord}</td>
        <td>${lastLocation}</td>
      </tr>
    `;
  }).join("");
}

function renderAll() {
  applySessionView();
  renderEmployeesSelect();
  renderPointView();
  if (isAdmin()) {
    renderEmployeeCards();
    renderReport();
  }
}

function applySessionView() {
  if (currentSession && currentSession.type === "employee" && !sessionEmployee()) {
    clearSession();
  }

  const authenticated = Boolean(currentSession);
  elements.loginScreen.classList.toggle("app-hidden", authenticated);
  elements.appShell.classList.toggle("app-hidden", !authenticated);

  if (!authenticated) return;

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.classList.toggle("app-hidden", !isAdmin());
  });

  if (!isAdmin() && !document.querySelector("#ponto").classList.contains("active")) {
    activateTab("ponto");
  }

  const person = currentSession.user || sessionEmployee();
  elements.userName.textContent = person ? person.name : "Usuário";
  elements.userRole.textContent = isAdmin() ? "Administrador" : "Funcionário";
  elements.userInitials.textContent = initials(person ? person.name : "Usuário");
  elements.employeeSelect.disabled = !isAdmin();
}

function activateTab(tabId) {
  document.querySelectorAll(".nav-tab, .tab-view").forEach((item) => item.classList.remove("active"));
  const tabButton = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  const view = document.querySelector(`#${tabId}`);
  if (tabButton) tabButton.classList.add("active");
  if (view) view.classList.add("active");
}

async function handleLogin(event) {
  event.preventDefault();

  const mode = new FormData(elements.loginForm).get("loginMode");
  const identifier = elements.loginIdentifier.value.trim();
  const password = elements.loginPassword.value.trim();

  if (mode === "admin") {
    await loginWithServer(mode, identifier, password);
    return;
  }

  await loginWithServer(mode, identifier, password);
}

async function loginWithServer(mode, identifier, password) {
  try {
    const session = await apiRequest("/api/login", {
      method: "POST",
      body: { mode, identifier, password }
    });

    saveSession(session);
    await refreshState();
    elements.loginForm.reset();
    document.querySelector('input[name="loginMode"][value="employee"]').checked = true;
    updateLoginMode();
    activateTab("ponto");
    renderAll();
    startAutoSync();
    showToast(mode === "admin" ? "Administrador conectado." : `Bem-vindo, ${session.user.name}.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function logout() {
  try {
    if (currentSession) {
      await apiRequest("/api/logout", { method: "POST" });
    }
  } catch {
  }

  clearSession();
  stopAutoSync();
  stopCamera();
  state = { employees: [], records: [] };
  activateTab("ponto");
  applySessionView();
}

function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  elements.cameraPreview.srcObject = null;
  elements.cameraStatus.textContent = "Câmera aguardando permissão";
  elements.gpsStatus.textContent = "GPS será solicitado na batida";
}

function updateLoginMode() {
  const mode = new FormData(elements.loginForm).get("loginMode");
  const isAdminMode = mode === "admin";
  elements.loginIdentifierLabel.textContent = isAdminMode ? "E-mail do administrador" : "Código do funcionário";
  elements.loginIdentifier.placeholder = isAdminMode ? "admin@conecta.com" : "Ex: CET-001";
  elements.loginIdentifier.value = "";
  elements.loginPassword.value = "";
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    elements.cameraStatus.textContent = "Câmera não disponível neste navegador";
    showToast("Este navegador não liberou acesso à câmera.");
    return false;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    elements.cameraPreview.srcObject = cameraStream;
    elements.cameraStatus.textContent = "Câmera ativa";
    return true;
  } catch {
    elements.cameraStatus.textContent = "Permissão da câmera negada";
    showToast("Não foi possível acessar a câmera. Autorize a câmera para bater ponto.");
    return false;
  }
}

function capturePhoto() {
  const video = elements.cameraPreview;
  if (!cameraStream || !video.videoWidth || !video.videoHeight) {
    throw new Error("camera-unavailable");
  }

  const maxWidth = 480;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);
  const canvas = elements.photoCanvas;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, width, height);
  context.setTransform(1, 0, 0, 1, 0, 0);

  return canvas.toDataURL("image/jpeg", 0.78);
}

function getGpsPosition() {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("gps-unavailable"));
  }

  elements.gpsStatus.textContent = "Solicitando localização...";

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString()
        };
        elements.gpsStatus.textContent = `GPS capturado com precisão de ${Math.round(location.accuracy)} m`;
        resolve(location);
      },
      reject,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

async function punch(action) {
  const employee = selectedEmployee();
  if (!employee) return;

  const records = recordsForEmployeeDay(employee.id);
  if (!canPunch(action, records)) {
    showToast(`Registro inválido agora. Status atual: ${nextStatus(records)}.`);
    return;
  }

  setPunchButtonsDisabled(true);
  elements.statusBadge.textContent = "Validando...";

  if (!cameraStream && !(await startCamera())) {
    setPunchButtonsDisabled(false);
    elements.statusBadge.textContent = nextStatus(records);
    return;
  }

  let photo;
  let location;

  try {
    photo = capturePhoto();
  } catch {
    showToast("A foto não foi capturada. Ative a câmera antes de bater ponto.");
    setPunchButtonsDisabled(false);
    elements.statusBadge.textContent = nextStatus(records);
    return;
  }

  try {
    location = await getGpsPosition();
  } catch {
    elements.gpsStatus.textContent = "GPS não autorizado ou indisponível";
    showToast("O ponto não foi salvo. Autorize o GPS para registrar a localização.");
    setPunchButtonsDisabled(false);
    elements.statusBadge.textContent = nextStatus(records);
    return;
  }

  const now = new Date();
  try {
    await apiRequest("/api/records", {
      method: "POST",
      body: {
        employeeId: employee.id,
        action,
        timestamp: now.toISOString(),
        date: todayKey(now),
        location,
        photo
      }
    });

    await refreshState();
    renderAll();
    showToast(`${actionLabels[action]} registrada para ${employee.name}.`);
  } catch (error) {
    showToast(error.message);
    elements.statusBadge.textContent = nextStatus(records);
  } finally {
    setPunchButtonsDisabled(false);
  }
}

function setPunchButtonsDisabled(disabled) {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.disabled = disabled;
  });
}

async function saveEmployee(event) {
  event.preventDefault();

  if (!isAdmin()) return;

  const id = elements.employeeId.value || crypto.randomUUID();
  const existing = state.employees.find((employee) => employee.id === id);
  const payload = {
    id,
    name: elements.employeeName.value.trim(),
    role: elements.employeeRole.value.trim(),
    code: elements.employeeCode.value.trim(),
    password: elements.employeePassword.value.trim(),
    active: existing ? existing.active : true
  };

  if (!payload.name || !payload.role || !payload.code || (!existing && !payload.password)) return;

  try {
    await apiRequest("/api/employees", {
      method: "POST",
      body: payload
    });
    await refreshState();
    clearEmployeeForm();
    renderAll();
    showToast("Funcionário salvo.");
  } catch (error) {
    showToast(error.message);
  }
}

function clearEmployeeForm() {
  elements.employeeId.value = "";
  elements.employeeName.value = "";
  elements.employeeRole.value = "";
  elements.employeeCode.value = "";
  elements.employeePassword.value = "";
  elements.employeePassword.placeholder = "";
}

function editEmployee(id) {
  const employee = state.employees.find((item) => item.id === id);
  if (!employee) return;

  elements.employeeId.value = employee.id;
  elements.employeeName.value = employee.name;
  elements.employeeRole.value = employee.role;
  elements.employeeCode.value = employee.code;
  elements.employeePassword.value = "";
  elements.employeePassword.placeholder = "Deixe em branco para manter";
}

async function toggleEmployee(id) {
  if (!isAdmin()) return;
  try {
    const result = await apiRequest(`/api/employees/${encodeURIComponent(id)}/toggle`, { method: "PATCH" });
    await refreshState();
    renderAll();
    showToast(result.employee.active ? "Funcionário ativado." : "Funcionário inativado.");
  } catch (error) {
    showToast(error.message);
  }
}

async function exportCsv() {
  if (!isAdmin()) return;
  try {
    const response = await fetch("/api/export.csv", {
      headers: { Authorization: `Bearer ${currentSession.token}` }
    });
    if (!response.ok) throw new Error("Não foi possível exportar CSV.");
    const content = await response.text();
    downloadFile("ponto-conecta-rhid.csv", content, "text/csv");
  } catch (error) {
    showToast(error.message);
  }
}

async function backupJson() {
  if (!isAdmin()) return;
  try {
    const payload = await apiRequest("/api/backup");
    downloadFile("backup-conecta-rhid.json", JSON.stringify(payload, null, 2), "application/json");
  } catch (error) {
    showToast(error.message);
  }
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2800);
}

function formatLocation(location) {
  if (!location) return "GPS não registrado";
  return `GPS: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} · precisão ${Math.round(location.accuracy)} m`;
}

function formatLocationLink(location) {
  if (!location) return "-";
  const latitude = Number(location.latitude).toFixed(6);
  const longitude = Number(location.longitude).toFixed(6);
  const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
  return `<a class="map-link" href="${url}" target="_blank" rel="noreferrer">Ver mapa</a>`;
}

function escapeHtml(value) {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
}

document.querySelectorAll(".nav-tab").forEach((button) => {
  button.addEventListener("click", () => {
    if (!isAdmin() && button.dataset.tab !== "ponto") return;
    activateTab(button.dataset.tab);
  });
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => punch(button.dataset.action));
});

elements.startCameraButton.addEventListener("click", startCamera);
elements.loginForm.addEventListener("submit", handleLogin);
elements.logoutButton.addEventListener("click", logout);
document.querySelectorAll('input[name="loginMode"]').forEach((input) => {
  input.addEventListener("change", updateLoginMode);
});
elements.employeeSelect.addEventListener("change", renderPointView);
elements.employeeForm.addEventListener("submit", saveEmployee);
elements.clearFormButton.addEventListener("click", clearEmployeeForm);
elements.monthFilter.addEventListener("change", renderReport);
elements.exportCsvButton.addEventListener("click", exportCsv);
elements.backupButton.addEventListener("click", backupJson);

elements.employeeCards.addEventListener("click", (event) => {
  const editId = event.target.dataset.edit;
  const toggleId = event.target.dataset.toggle;
  if (editId) editEmployee(editId);
  if (toggleId) toggleEmployee(toggleId);
});

elements.monthFilter.value = monthKey();
renderClock();
updateLoginMode();
if (currentSession) {
  refreshState()
    .then(() => {
      renderAll();
      startAutoSync();
    })
    .catch(() => {
      clearSession();
      applySessionView();
    });
} else {
  applySessionView();
}
window.setInterval(renderClock, 1000);
