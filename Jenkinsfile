def proxyHostHttp = "--proxy http://"
def proxyHostHttps = "--https-proxy http://"

pipeline {
    options {
        timeout(time: 20, unit: 'MINUTES')
    }

    environment {
        PASS_DOCKER_REPO = credentials('registry-pass')
        PASS_PROXY = credentials('proxy-pass')

        DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE = credentials('DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE')
        DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE = credentials('DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE')
        DCT_KEYS_PATH = credentials('DCT_KEYS_PATH')

        NOTARY_SERVER = 'https://172.22.176.195:4443'
    }

    agent any

    parameters {
        string(defaultValue: 'admin', name: 'REGISTRY_USER')
        string(defaultValue: '18', name: 'NODE_VERSION')

        string(defaultValue: '172.22.33.174', name: 'PROXY_HOST')
        string(defaultValue: '3128', name: 'PROXY_PORT')

        string(defaultValue: '172.22.176.195', name: 'HOST_DOCKER_REPO')
        string(defaultValue: '8083', name: 'PORT_DOCKER_REPO')

        string(defaultValue: 'itdgtpconreg01cnr.azurecr.io', name: 'ACR_SERVER')
        string(defaultValue: 'shrdcomauingridacr01.azurecr.io', name: 'PLATFORM_REGISTRY')

        booleanParam(name: 'RUN_TESTS', defaultValue: true, description: 'Run npm tests?')

        booleanParam(name: 'PUSH_NEXUS', defaultValue: false, description: 'Push to Nexus?')

        booleanParam(name: 'PUSH_PLATFORM_REGISTRY', defaultValue: false, description: 'Push to platform registry?')

        booleanParam(name: 'DEPLOY_SERVICE', defaultValue: false, description: 'Deploy service?')

        booleanParam(name: 'RUN_QUALYS', defaultValue: true, description: 'Run Qualys scan?')

        string(name: 'APP_TAG')

        string(defaultValue: 'develop', name: 'BRANCH_NAME')
    }

    stages {

        stage('Install Dependencies') {
            steps {
                echo "Installing npm dependencies..."

                sh """
                    npm config set proxy http://${params.PROXY_HOST}:${params.PROXY_PORT}
                    npm config set https-proxy http://${params.PROXY_HOST}:${params.PROXY_PORT}

                    npm install
                """
            }
        }

        stage('Build') {
            steps {
                echo "Building Node.js application..."

                sh "npm run build"
            }
        }

        stage('Tests') {
            when {
                expression { params.RUN_TESTS == true }
            }

            steps {
                echo "Running npm tests..."

                sh "npm test"
            }

            post {
                failure {
                    junit '**/junit.xml'
                    echo "Tests failed!"
                }
            }
        }

        stage('SonarQube analysis') {
            steps {
                echo "Running SonarQube analysis..."

                script {
                    def scannerHome = tool 'sonar-scanner'

                    withSonarQubeEnv('sonar') {

                        sh """
                        ${scannerHome}/bin/sonar-scanner \
                        -Dsonar.projectKey=NODEJSAPP \
                        -Dsonar.projectName=NODEJSAPP \
                        -Dsonar.sources=src \
                        -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                        -Dsonar.exclusions=node_modules/**,coverage/**
                        """
                    }
                }
            }
        }

        stage('Build Docker Image') {
            steps {

                echo "Building Docker image..."

                sh "docker pull node:${params.NODE_VERSION}-alpine"

                sh """
                    docker build \
                    -t NODEJSAPP:latest .
                """
            }
        }

        stage('Qualys analysis') {

            when {
                expression { params.RUN_QUALYS == true }
            }

            steps {

                script {
                    def IMAGE_ID = sh(
                        script: "docker images | grep -E '^NODEJSAPP.*latest' | head -1 | awk '{print \$3}'",
                        returnStdout: true
                    ).trim()

                    env.IMAGE_ID = IMAGE_ID
                }

                getImageVulnsFromQualys useGlobalConfig:true, imageIds: env.IMAGE_ID
            }
        }

        stage('Push image on Nexus') {

            when {
                allOf {
                    expression { params.PUSH_NEXUS == true }
                    expression { params.APP_TAG != '' }
                    expression { params.HOST_DOCKER_REPO != '' }
                }
            }

            steps {

                catchError {

                    sh "chmod +x ./sign_docker_image.sh"

                    sh """
                        docker login \
                        -u ${params.REGISTRY_USER} \
                        -p $PASS_DOCKER_REPO \
                        ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO}
                    """

                    sh """
                        docker tag NODEJSAPP:latest \
                        ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO}/NODEJSAPP:${params.APP_TAG}
                    """

                    sh """
                        docker push \
                        ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO}/NODEJSAPP:${params.APP_TAG}
                    """

                    sh """
                        ./sign_docker_image.sh \
                        $DCT_KEYS_PATH \
                        $DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE \
                        $DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE \
                        ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO}/NODEJSAPP \
                        ${params.APP_TAG} \
                        $NOTARY_SERVER
                    """
                }

                echo currentBuild.result
            }
        }

        stage('Push image on Azure') {

            when {
                allOf {
                    expression { params.ACR_SERVER != '' }
                    expression { params.APP_TAG != '' }
                }
            }

            steps {

                withCredentials([
                    usernamePassword(
                        credentialsId: 'f54bada6-e0bc-4c30-9843-006c20c654da',
                        usernameVariable: 'ACR_USER',
                        passwordVariable: 'ACR_PASSWORD'
                    )
                ]) {

                    sh """
                        docker tag NODEJSAPP:latest \
                        ${params.ACR_SERVER}/NODEJSAPP:${params.APP_TAG}
                    """

                    sh """
                        docker login \
                        -u ${ACR_USER} \
                        -p ${ACR_PASSWORD} \
                        ${params.ACR_SERVER}
                    """

                    sh """
                        docker push \
                        ${params.ACR_SERVER}/NODEJSAPP:${params.APP_TAG}
                    """
                }
            }
        }

        stage('Push image on Platform registry') {

            when {
                allOf {
                    expression { params.PUSH_PLATFORM_REGISTRY == true }
                    expression { params.PLATFORM_REGISTRY != '' }
                    expression { params.APP_TAG != '' }
                }
            }

            steps {

                withCredentials([
                    usernamePassword(
                        credentialsId: 'ingrid_acr_shared_registry',
                        usernameVariable: 'ACR_USER',
                        passwordVariable: 'ACR_PASSWORD'
                    )
                ]) {

                    sh """
                        docker tag NODEJSAPP:latest \
                        ${params.PLATFORM_REGISTRY}/NODEJSAPP:${params.APP_TAG}
                    """

                    sh """
                        docker login \
                        -u ${ACR_USER} \
                        -p ${ACR_PASSWORD} \
                        ${params.PLATFORM_REGISTRY}
                    """

                    sh """
                        docker push \
                        ${params.PLATFORM_REGISTRY}/NODEJSAPP:${params.APP_TAG}
                    """
                }
            }
        }

        stage('Deploy Service') {

            when {
                expression { params.DEPLOY_SERVICE == true }
            }

            steps {

                echo "Deploying Node.js application..."

                dir("/var/jenkins_home/ansible") {

                    ansiblePlaybook([
                        inventory   : 'hosts',
                        playbook    : 'playbook_NODEJSAPP.yml',
                        installation: 'ansible',
                        colorized   : true,

                        extraVars   : [
                            APP_TAG      : "${params.APP_TAG}",
                            REGISTRY_PASS: "$PASS_DOCKER_REPO",
                        ]
                    ])
                }
            }
        }
    }
}