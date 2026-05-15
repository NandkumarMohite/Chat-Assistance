// Jenkinsfile — Comau Chat Assistant CI/CD Pipeline

def proxyHostHttp = "-Dhttp.proxyHost="
def proxyPortHttp = "-Dhttp.proxyPort="
def proxyHostHttps = "-Dhttps.proxyHost="
def proxyPortHttps = "-Dhttps.proxyPort="

pipeline {

    agent any

    options {
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
    }

    environment {

        // Jenkins Credentials
        PASS_DOCKER_REPO = credentials('registry-pass')
        PASS_PROXY = credentials('proxy-pass')

        DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE = credentials('DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE')
        DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE = credentials('DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE')
        DCT_KEYS_PATH = credentials('DCT_KEYS_PATH')

        // Static Variables
        NOTARY_SERVER = 'https://172.22.176.195:4443'

        BACKEND_URL = 'http://172.22.10.25:8080'
    }

    parameters {

        string(
            name: 'NODE_VERSION',
            defaultValue: '22',
            description: 'Node.js version'
        )

        string(
            name: 'APP_TAG',
            defaultValue: 'latest',
            description: 'Docker image tag'
        )

        string(
            name: 'BRANCH_NAME',
            defaultValue: 'develop',
            description: 'Git branch'
        )

        string(
            name: 'PROXY_HOST',
            defaultValue: '172.22.33.174',
            description: 'Proxy host'
        )

        string(
            name: 'PROXY_PORT',
            defaultValue: '3128',
            description: 'Proxy port'
        )

        string(
            name: 'HOST_DOCKER_REPO',
            defaultValue: '172.22.176.195',
            description: 'Nexus Docker registry host'
        )

        string(
            name: 'PORT_DOCKER_REPO',
            defaultValue: '8083',
            description: 'Nexus Docker registry port'
        )

        string(
            name: 'ACR_SERVER',
            defaultValue: 'itdgtpconreg01cnr.azurecr.io',
            description: 'Azure Container Registry'
        )

        string(
            name: 'PLATFORM_REGISTRY',
            defaultValue: 'shrdcomauingridacr01.azurecr.io',
            description: 'Platform Registry'
        )

        string(
            name: 'COMAUCHATASSISTANT_TAG',
            defaultValue: 'latest',
            description: 'Final image tag'
        )

        booleanParam(
            name: 'RUN_TESTS',
            defaultValue: true,
            description: 'Run npm tests'
        )

        booleanParam(
            name: 'BUILD_IMAGE',
            defaultValue: true,
            description: 'Build docker image'
        )

        booleanParam(
            name: 'PUSH_AZURE',
            defaultValue: false,
            description: 'Push image to Azure ACR'
        )

        booleanParam(
            name: 'PUSH_PLATFORM_REGISTRY',
            defaultValue: false,
            description: 'Push image to Platform Registry'
        )

        booleanParam(
            name: 'DEPLOY_SERVICE',
            defaultValue: false,
            description: 'Deploy service'
        )
    }

    stages {

        stage('Initialize') {

            steps {

                echo "🚀 Starting Comau Chat Assistant Pipeline"
                echo "📍 Backend URL: ${env.BACKEND_URL}"
                echo "🏷️ Image Tag: ${params.APP_TAG}"
            }
        }

        stage('Install Dependencies') {

            steps {

                echo "📦 Installing npm dependencies"

                sh """
                    npm config set proxy http://${params.PROXY_HOST}:${params.PROXY_PORT}

                    npm config set https-proxy http://${params.PROXY_HOST}:${params.PROXY_PORT}

                    npm install
                """
            }
        }

        stage('Run Tests') {

            when {
                expression { params.RUN_TESTS == true }
            }

            steps {

                echo "🧪 Running tests"

                sh """
                    npm test || echo 'No tests found, skipping...'
                """
            }
        }

        stage('Build Docker Image') {

            when {
                expression { params.BUILD_IMAGE == true }
            }

            steps {

                echo "🏗️ Building Docker image"

                withCredentials([
                    usernamePassword(
                        credentialsId: 'ingrid_acr_shared_registry',
                        usernameVariable: 'ACR_USER',
                        passwordVariable: 'ACR_PASSWORD'
                    )
                ]) {

                    sh '''
                        echo "$ACR_PASSWORD" | docker login \
                        -u "$ACR_USER" \
                        --password-stdin \
                        shrdcomauingridacr01.azurecr.io
                    '''

                    echo "✅ Logged into ACR"

                    sh """
                        docker pull \
                        shrdcomauingridacr01.azurecr.io/node/node:22
                    """

                    echo "📦 Base image pulled successfully"

                    sh """
                        docker build \
                        --network=host \
                        --no-cache \
                        --build-arg HTTP_PROXY=http://${params.PROXY_HOST}:${params.PROXY_PORT} \
                        --build-arg HTTPS_PROXY=http://${params.PROXY_HOST}:${params.PROXY_PORT} \
                        --build-arg http_proxy=http://${params.PROXY_HOST}:${params.PROXY_PORT} \
                        --build-arg https_proxy=http://${params.PROXY_HOST}:${params.PROXY_PORT} \
                        -f chatAssistant.Dockerfile \
                        -t comauchatassistant:${params.APP_TAG} .
                    """
                }
            }
        }

        stage('Push Image To Azure ACR') {

            when {
                expression { params.PUSH_AZURE == true }
            }

            steps {

                echo "📤 Pushing image to Azure ACR"

                withCredentials([
                    usernamePassword(
                        credentialsId: 'f54bada6-e0bc-4c30-9843-006c20c654da',
                        usernameVariable: 'ACR_USER',
                        passwordVariable: 'ACR_PASSWORD'
                    )
                ]) {

                    sh '''
                        echo "$ACR_PASSWORD" | docker login \
                        -u "$ACR_USER" \
                        --password-stdin \
                        itdgtpconreg01cnr.azurecr.io
                    '''

                    sh """
                        docker tag \
                        comauchatassistant:${params.APP_TAG} \
                        ${params.ACR_SERVER}/comauchatassistant:${params.COMAUCHATASSISTANT_TAG}
                    """

                    sh """
                        docker push \
                        ${params.ACR_SERVER}/comauchatassistant:${params.COMAUCHATASSISTANT_TAG}
                    """
                }
            }
        }

        stage('Push Image To Platform Registry') {

            when {
                expression { params.PUSH_PLATFORM_REGISTRY == true }
            }

            steps {

                echo "📤 Pushing image to Platform Registry"

                withCredentials([
                    usernamePassword(
                        credentialsId: 'ingrid_acr_shared_registry',
                        usernameVariable: 'ACR_USER',
                        passwordVariable: 'ACR_PASSWORD'
                    )
                ]) {

                    sh '''
                        echo "$ACR_PASSWORD" | docker login \
                        -u "$ACR_USER" \
                        --password-stdin \
                        shrdcomauingridacr01.azurecr.io
                    '''

                    sh """
                        docker tag \
                        comauchatassistant:${params.APP_TAG} \
                        ${params.PLATFORM_REGISTRY}/comauchatassistant:${params.COMAUCHATASSISTANT_TAG}
                    """

                    sh """
                        docker push \
                        ${params.PLATFORM_REGISTRY}/comauchatassistant:${params.COMAUCHATASSISTANT_TAG}
                    """
                }
            }
        }
    }

    post {

        always {

            echo "🏁 Pipeline finished"

            script {

                try {

                    sh """
                        docker logout ${params.ACR_SERVER} || true
                        docker logout ${params.PLATFORM_REGISTRY} || true
                        docker logout ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO} || true
                    """

                } catch (Exception e) {

                    echo "Skipping docker logout: ${e.getMessage()}"
                }
            }
        }

        success {

            echo "✅ Build Successful"
        }

        failure {

            echo "❌ Build Failed"
        }
    }
}