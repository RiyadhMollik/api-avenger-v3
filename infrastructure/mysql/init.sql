-- Create databases for each microservice
CREATE DATABASE IF NOT EXISTS careforall_auth;
CREATE DATABASE IF NOT EXISTS careforall_campaigns;
CREATE DATABASE IF NOT EXISTS careforall_pledges;
CREATE DATABASE IF NOT EXISTS careforall_payments;
CREATE DATABASE IF NOT EXISTS careforall_totals;
CREATE DATABASE IF NOT EXISTS careforall_admin;

-- Grant privileges
GRANT ALL PRIVILEGES ON careforall_auth.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON careforall_campaigns.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON careforall_pledges.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON careforall_payments.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON careforall_totals.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON careforall_admin.* TO 'root'@'%';

FLUSH PRIVILEGES;
