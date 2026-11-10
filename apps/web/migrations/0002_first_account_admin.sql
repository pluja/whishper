-- Every instance created before roles existed has a single account: the owner
-- who ran the first-time setup. It becomes the administrator.
UPDATE `auth_users` SET `role` = 'admin'
WHERE `id` = (SELECT `id` FROM `auth_users` ORDER BY `created_at`, `id` LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM `auth_users` WHERE `role` = 'admin');
