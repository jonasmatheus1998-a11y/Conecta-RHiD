update public.conecta_admins
set password_hash = extensions.crypt('COLOQUE_A_NOVA_SENHA_AQUI', extensions.gen_salt('bf'))
where email = 'admin@conecta.com';

notify pgrst, 'reload schema';
