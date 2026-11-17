# People Prime LMS — AWS Production Deployment Guide

This guide provides step-by-step instructions for deploying the existing People Prime LMS on Amazon Web Services (AWS) using:
- **AWS EC2 (Ubuntu 22.04 LTS / 24.04 LTS)**: Django REST Framework backend application server.
- **Gunicorn + Nginx**: Production WSGI application server with reverse proxy and SSL termination.
- **AWS RDS PostgreSQL**: Managed production relational database with SSL enforcement.
- **AWS S3 (Private Bucket)**: Secure storage for learning materials, training files, and generated document previews.
- **AWS S3 + CloudFront (SPA Hosting)**: High-performance global CDN hosting for the compiled React frontend.
- **Let's Encrypt / AWS Certificate Manager (ACM)**: HTTPS encryption for frontend and backend domains.

---

## Architecture Overview

```
                      ┌───────────────────────┐
                      │   End-User Browser    │
                      └───────────┬───────────┘
                                  │ HTTPS
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
         ▼                                                 ▼
┌─────────────────────────┐                     ┌─────────────────────────┐
│     CloudFront CDN      │                     │   Nginx Reverse Proxy   │
│  (https://lms.domain)   │                     │  (https://api.domain)   │
└────────────┬────────────┘                     └────────────┬────────────┘
             │                                               │ Unix Socket
             ▼                                               ▼
┌─────────────────────────┐                     ┌─────────────────────────┐
│   Frontend S3 Bucket    │                     │    Gunicorn + Django    │
│  (Static React Build)   │                     │      (Ubuntu EC2)       │
└─────────────────────────┘                     └──────┬────────────┬─────┘
                                                       │            │
                                       IAM Role Access │            │ SSL / Port 5432
                                                       ▼            ▼
                                            ┌───────────────┐ ┌───────────────┐
                                            │ Private S3    │ │ AWS RDS       │
                                            │ Materials     │ │ PostgreSQL    │
                                            │ Bucket        │ └───────────────┘
                                            └───────────────┘
```

---

## 1. Required AWS Infrastructure & Provisioning

### 1.1 VPC & Subnets
- Recommended: 1 VPC with at least 2 Availability Zones.
- **Public Subnets**: EC2 instance (Backend) and Application Load Balancer (if ALB is used).
- **Private Subnets**: RDS PostgreSQL instance (no direct public internet exposure).

### 1.2 Security Groups Configuration

| Security Group | Inbound Rules | Outbound Rules | Purpose |
|---|---|---|---|
| `lms-ec2-sg` | • Port 22 (SSH) from your Admin IP<br>• Port 80 (HTTP) from `0.0.0.0/0`<br>• Port 443 (HTTPS) from `0.0.0.0/0` | All traffic (`0.0.0.0/0`) | EC2 Web Server |
| `lms-rds-sg` | • Port 5432 (PostgreSQL) strictly from `lms-ec2-sg` | All traffic | Private RDS Database |

---

## 2. Amazon S3 Buckets Setup

### 2.1 Private Training Materials Bucket
1. Create bucket: `people-prime-lms-materials-prod` (choose your AWS region, e.g. `ap-south-1`).
2. **Block Public Access**: Keep **Block *all* public access** enabled (`ON`).
3. **Bucket Encryption**: Enable SSE-S3 or AWS KMS.
4. **Bucket Versioning**: Optional, recommended for data safety.
5. **CORS Policy** (if direct authenticated previews are needed):
   ```json
   [
     {
       "AllowedHeaders": ["*"],
       "AllowedMethods": ["GET", "HEAD"],
       "AllowedOrigins": ["https://lms.yourdomain.com"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3000
     }
   ]
   ```

### 2.2 Frontend S3 Bucket (CloudFront Origin)
1. Create bucket: `people-prime-lms-frontend-prod`.
2. **Block Public Access**: Keep enabled. Access will be granted strictly through CloudFront using **Origin Access Control (OAC)**.

---

## 3. IAM Role for EC2 Instance

Attach an IAM Role to your EC2 instance so Django automatically authenticates with S3 without saving access keys or credentials on the server.

### Least-Privilege IAM Policy for S3 Materials:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LMSMaterialsBucketAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ],
      "Resource": "arn:aws:s3:::people-prime-lms-materials-prod"
    },
    {
      "Sid": "LMSMaterialsObjectsAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::people-prime-lms-materials-prod/*"
    }
  ]
}
```

---

## 4. AWS RDS PostgreSQL Configuration

1. **Engine**: PostgreSQL 16 (or 15).
2. **Instance Class**: `db.t4g.micro` or `db.t4g.small` (General Purpose / Burstable).
3. **Storage**: 20–50 GB gp3 with Auto-scaling enabled.
4. **Public Access**: **No** (accessible only within VPC by `lms-ec2-sg`).
5. **Initial Database Name**: `lms_prod`.
6. **Master Username**: `lmsadmin`.
7. **Master Password**: Generate a secure 32+ character password.
8. **Automated Backups**: Enable with a 7-day or 14-day retention window.

---

## 5. Ubuntu EC2 Server Setup (Backend)

Run these commands on your freshly launched Ubuntu EC2 instance (`t3.medium` or `t3.small` recommended):

### 5.1 System Packages & Dependencies
```bash
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y python3-pip python3-venv python3-dev libpq-dev nginx certbot python3-certbot-nginx git
```

### 5.2 Clone Repository & Create Virtual Environment
```bash
# Clone to /var/www/lms
sudo mkdir -p /var/www/lms
sudo chown -R ubuntu:ubuntu /var/www/lms
git clone https://github.com/your-org/lms.git /var/www/lms
cd /var/www/lms/backend

# Create virtualenv
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip and install requirements
pip install --upgrade pip
pip install -r requirements.txt
```

### 5.3 Configure Backend Environment Variables
Create `/var/www/lms/backend/.env` with strict permissions:

```bash
cat << 'EOF' > /var/www/lms/backend/.env
# ==========================================
# People Prime LMS Production Configuration
# ==========================================

DEBUG=False
SECRET_KEY=generate-a-strong-random-64-character-string-here
ALLOWED_HOSTS=api.yourdomain.com,127.0.0.1,localhost

# AWS RDS PostgreSQL
DB_NAME=lms_prod
DB_USER=lmsadmin
DB_PASSWORD=your-secure-rds-password-here
DB_HOST=lms-db.xxxx.ap-south-1.rds.amazonaws.com
DB_PORT=5432
DB_SSLMODE=require
DB_CONN_MAX_AGE=300

# CORS & CSRF
CORS_ALLOWED_ORIGINS=https://lms.yourdomain.com
CSRF_TRUSTED_ORIGINS=https://lms.yourdomain.com,https://api.yourdomain.com

# S3 Storage Configuration
USE_S3_STORAGE=True
AWS_STORAGE_BUCKET_NAME=people-prime-lms-materials-prod
AWS_S3_REGION_NAME=ap-south-1

# Security Settings
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS=True
SECURE_HSTS_PRELOAD=True

# Application Logging
LOG_LEVEL=INFO
DJANGO_LOG_LEVEL=WARNING
EOF

chmod 600 /var/www/lms/backend/.env
```

### 5.4 Database Migrations & Static Files
```bash
cd /var/www/lms/backend
source .venv/bin/activate

# Collect Django static files
python manage.py collectstatic --noinput

# Run database migrations safely
python manage.py migrate

# Create initial Superuser (Admin)
python manage.py createsuperuser
```

---

## 6. Gunicorn Application Server Configuration

Create systemd service file at `/etc/systemd/system/gunicorn.service`:

```ini
[Unit]
Description=Gunicorn daemon for People Prime LMS
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/var/www/lms/backend
ExecStart=/var/www/lms/backend/.venv/bin/gunicorn \
          --access-logfile - \
          --error-logfile - \
          --workers 3 \
          --timeout 120 \
          --bind unix:/run/gunicorn.sock \
          config.wsgi:application
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start Gunicorn:
```bash
sudo systemctl daemon-reload
sudo systemctl start gunicorn
sudo systemctl enable gunicorn
sudo systemctl status gunicorn
```

---

## 7. Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/lms-api`:

```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    # Maximum upload size for training files (100MB)
    client_max_body_size 100M;

    # Static files collected by Django
    location /static/ {
        alias /var/www/lms/backend/staticfiles/;
        expires 30d;
        access_log off;
    }

    # Pass all other requests to Gunicorn
    location / {
        include proxy_params;
        proxy_pass http://unix:/run/gunicorn.sock;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $http_host;
        proxy_redirect off;

        # Timeouts for document conversion
        proxy_connect_timeout 120s;
        proxy_read_timeout 120s;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/lms-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7.1 HTTPS via Let's Encrypt (Certbot)
```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## 8. Frontend Deployment (React + Vite to S3 + CloudFront)

### 8.1 Build the Frontend Locally or on CI/CD
In your local terminal or CI/CD runner:
```bash
cd frontend

# Set the production API URL before building
export VITE_API_URL="https://api.yourdomain.com/api"
npm ci
npm run build
```
This generates the optimized bundle in `frontend/dist/` (including `/pdf.worker.min.mjs`).

### 8.2 Upload Frontend to S3 Bucket
```bash
# Upload to S3 bucket
aws s3 sync frontend/dist/ s3://people-prime-lms-frontend-prod/ --delete
```

### 8.3 CloudFront Distribution Configuration
1. **Origin**: `people-prime-lms-frontend-prod.s3.amazonaws.com`
2. **Origin Access**: Origin Access Control (OAC) recommended.
3. **Viewer Protocol Policy**: **Redirect HTTP to HTTPS**.
4. **Allowed HTTP Methods**: `GET, HEAD, OPTIONS`.
5. **Default Root Object**: `index.html`.
6. **SSL Certificate**: Select ACM SSL certificate for `lms.yourdomain.com` (must be issued in `us-east-1` for CloudFront).
7. **CRITICAL: Single Page App (SPA) Deep-Linking Rule**:
   Under **Custom error responses**, add two entries:
   - **HTTP error code**: `403: Forbidden`
     - Response code: `200: OK`
     - Response page path: `/index.html`
   - **HTTP error code**: `404: Not Found`
     - Response code: `200: OK`
     - Response page path: `/index.html`

This ensures direct navigation to `/admin`, `/learner`, and `/viewer?fileId=...` routes loads correctly without 403/404 S3 errors.

---

## 9. Post-Deployment Verification Checklist

1. **Health Check Endpoint**:
   ```bash
   curl -i https://api.yourdomain.com/api/health/
   # Expect: HTTP 200 OK {"status": "healthy"}
   ```
2. **CSRF & Session Authentication**:
   - Navigate to `https://lms.yourdomain.com`.
   - Log in with Admin credentials.
   - Verify that session cookie (`sessionid`) has `Secure` and `HttpOnly` flags set.
3. **Document Viewer & S3 Preview**:
   - In Admin Portal → Universal Training Repository, click **Preview** on a DOCX and a PDF document.
   - Confirm that the multi-page continuous vertical viewer renders without download/print controls.
4. **Role Isolation**:
   - Log in as a Trainer and verify read-only access to courses.
   - Log in as a Learner and verify assigned courses and module progress tracking.

---

## 10. Rollback & Backup Procedures

### Database Backups:
- AWS RDS automated snapshots run daily.
- For manual backup before updates:
  ```bash
  pg_dump -h <rds-host> -U lmsadmin -d lms_prod -F c -b -v -f "lms_backup_$(date +%Y%m%d_%H%M%S).dump"
  ```

### Rollback Process:
1. **Backend Code**:
   ```bash
   cd /var/www/lms
   git checkout <previous-commit-hash>
   sudo systemctl restart gunicorn
   ```
2. **Frontend Build**:
   Sync previous build from local backup or CI artifact back to `s3://people-prime-lms-frontend-prod/` and invalidate CloudFront cache:
   ```bash
   aws cloudfront create-invalidation --distribution-id <DIST_ID> --paths "/*"
   ```
