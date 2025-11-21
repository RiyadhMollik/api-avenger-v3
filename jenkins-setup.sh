#!/bin/bash

echo "=========================================="
echo "Jenkins Setup Script for Hello World App"
echo "=========================================="

# Install Java (required for Jenkins)
echo "Installing Java..."
sudo apt update
sudo apt install -y openjdk-17-jre-headless

# Verify Java installation
java -version

# Install Jenkins
echo "Installing Jenkins..."
sudo wget -O /usr/share/keyrings/jenkins-keyring.asc \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2023.key
echo "deb [signed-by=/usr/share/keyrings/jenkins-keyring.asc]" \
  https://pkg.jenkins.io/debian-stable binary/ | sudo tee \
  /etc/apt/sources.list.d/jenkins.list > /dev/null
sudo apt update
sudo apt install -y jenkins

# Start Jenkins
echo "Starting Jenkins..."
sudo systemctl start jenkins
sudo systemctl enable jenkins

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    sudo apt install -y docker.io
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # Add Jenkins user to docker group
    sudo usermod -aG docker jenkins
    sudo usermod -aG docker $USER
fi

# Wait for Jenkins to start
echo "Waiting for Jenkins to start..."
sleep 30

# Get initial admin password
echo "=========================================="
echo "Jenkins Initial Admin Password:"
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
echo "=========================================="

echo ""
echo "Jenkins is now running at: http://localhost:8080"
echo ""
echo "Next steps:"
echo "1. Open http://localhost:8080 in your browser"
echo "2. Use the password shown above to unlock Jenkins"
echo "3. Install suggested plugins"
echo "4. Create your first admin user"
echo "5. After setup, run: ./jenkins-configure.sh"
echo ""
