#!/bin/bash

echo "=========================================="
echo "Jenkins Configuration Script"
echo "=========================================="

JENKINS_URL="http://localhost:8080"

# Download Jenkins CLI
echo "Downloading Jenkins CLI..."
wget ${JENKINS_URL}/jnlpJars/jenkins-cli.jar -O jenkins-cli.jar

# You'll need to get your API token from Jenkins UI:
# User menu (top right) → Configure → API Token → Add new Token

echo ""
echo "To complete the setup, you need to:"
echo ""
echo "1. Get your Jenkins API token:"
echo "   - Login to Jenkins at ${JENKINS_URL}"
echo "   - Click your username (top right) → Configure"
echo "   - Click 'Add new Token' under API Token section"
echo "   - Copy the generated token"
echo ""
echo "2. Then run these commands (replace YOUR_USERNAME and YOUR_TOKEN):"
echo ""
echo "   export JENKINS_USER='YOUR_USERNAME'"
echo "   export JENKINS_TOKEN='YOUR_TOKEN'"
echo ""
echo "3. Install required plugins:"
echo ""
echo "   java -jar jenkins-cli.jar -s ${JENKINS_URL} -auth \${JENKINS_USER}:\${JENKINS_TOKEN} install-plugin docker-workflow"
echo "   java -jar jenkins-cli.jar -s ${JENKINS_URL} -auth \${JENKINS_USER}:\${JENKINS_TOKEN} install-plugin nodejs"
echo "   java -jar jenkins-cli.jar -s ${JENKINS_URL} -auth \${JENKINS_USER}:\${JENKINS_TOKEN} safe-restart"
echo ""
echo "=========================================="
