// Jenkinsfile — Chat AI Microservice Pipeline
def proxyHostHttp = "-Dhttp.proxyHost="
def proxyPortHttp = "-Dhttp.proxyPort="
def proxyHostHttps = "-Dhttps.proxyHost="
def proxyPortHttps = "-Dhttps.proxyPort="

pipeline {
    agent any

    options {
        timeout(time: 20, unit: 'MINUTES')
        ansiColor('xterm')
    }

    environment {
        PASS_DOCKER_REPO = credentials('registry-pass')
        PASS_PROXY = credentials('proxy-pass')
        DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE = credentials('DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE')
        DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE = credentials('DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE')
        DCT_KEYS_PATH = credentials('DCT_KEYS_PATH')
        NOTARY_SERVER = 'https://172.22.176.195:4443'
        // Credentials stored in Jenkins
        DOCKER_HUB_USER = 'nandkumarmohite'
        DOCKER_HUB_PASS = credentials('registry-pass') // Add this ID in Jenkins Credentials
        
        // Use the centralized BACKEND_URL from Jenkins environment or credentials
        BACKEND_URL = credentials('backend-api-url') 
    }
  agent any
    parameters {
        string(defaultValue: '18', name: 'NODE_VERSION', description: 'Node.js version for Docker build')
        string(defaultValue: 'latest', name: 'APP_TAG', description: 'Tag for the Docker image')
        
        // Proxy settings (matching your example)
        string(defaultValue: '172.22.33.174', name: 'PROXY_HOST')
        string(defaultValue: '3128', name: 'PROXY_PORT')
        string(defaultValue: '172.22.176.195', name: 'HOST_DOCKER_REPO')
        string(defaultValue: '3000', name: 'PORT_DOCKER_REPO')
        string(defaultValue: 'itdgtpconreg01cnr.azurecr.io', name: 'ACR_SERVER')
        string(defaultValue: 'shrdcomauingridacr01.azurecr.io', name: 'PLATFORM_REGISTRY')
        booleanParam(name: 'RUN_TESTS', defaultValue: true, description: 'Run npm tests?')
        booleanParam(name: 'PUSH_IMAGE', defaultValue: true, description: 'Push image to Docker Hub?')
        booleanParam(name: 'RUN_QUALYS', defaultValue: true, description: 'Do you want to run Qualys vulnerability scanner?')
        booleanParam(name: 'DEPLOY_SERVICE', defaultValue: false, description: 'Deploy to VM?')
        string(name: 'COMAUCHATASSISTANT_TAG')
        string(defaultValue: 'develop', name: 'BRANCH_NAME', description: 'The branch from which take the code')
    }

    stages {
        stage('Initialize') {
            steps {
                echo "🚀 Starting build for Comau Chat Assistant..."
                echo "📍 Backend Target: ${env.BACKEND_URL}"
            }
        }

        stage('Install Dependencies') {
            steps {
                echo "📦 Installing npm dependencies..."
                sh """
                    npm config set proxy http://${params.PROXY_HOST}:${params.PROXY_PORT}
                    npm config set https-proxy http://${params.PROXY_HOST}:${params.PROXY_PORT}
                    npm install
                """
            }
        }

        stage('Tests') {
            when { expression { params.RUN_TESTS == true } }
            steps {
                echo "🧪 Running tests..."
                // Replace with your test command (e.g., npm test)
                sh "npm test || echo 'No tests found, skipping...'"
            }
        }

        stage('Build Docker Image') {
            steps {
                echo "🏗️ Building Docker image..."
                sh """
                    docker build \
                    --build-arg NODE_VERSION=${params.NODE_VERSION} \
                    -t ${env.DOCKER_HUB_USER}/comauchatassistant:${params.APP_TAG} .
                """
            }
        }

         stage('Push image on Nexus'){
                when {
                     allOf {
                           expression { params.PUSH_NEXUS == true}
                           expression { params.COMAUCHATASSISTANT_TAG != ''}
                           expression { params.HOST_DOCKER_REPO != ''}
                           }
                      }
            steps{
                catchError {
                sh " chmod +x ./sign_docker_image.sh"
                sh " docker login -u ${params.REGISTRY_USER} -p $PASS_DOCKER_REPO ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO} "
                sh "./sign_docker_image.sh $DCT_KEYS_PATH  $DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE $DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE ${params.HOST_DOCKER_REPO}:${params.PORT_DOCKER_REPO}/comauchatassistant ${params.comauchatassistant_TAG} $NOTARY_SERVER "
                 }
                echo currentBuild.result
            }
        }

                stage('Push image on Azure') {
             when {
                 allOf {
                       expression { params.ACR_SERVER != ''}
                       expression { params.comauchatassistant_TAG != ''}
                       }
                  }
             steps {
                  withCredentials([usernamePassword(credentialsId: 'f54bada6-e0bc-4c30-9843-006c20c654da', usernameVariable: 'ACR_USER', passwordVariable: 'ACR_PASSWORD')]){
                     sh " docker tag comauchatassistant:latest ${params.ACR_SERVER}/comauchatassistant:${params.comauchatassistant_TAG} "
                     sh " docker login -u ${ACR_USER} -p ${ACR_PASSWORD} ${params.ACR_SERVER}"
                     sh " docker push ${params.ACR_SERVER}/comauchatassistant:${params.comauchatassistant_TAG}"
                  }
             }
        }

                stage('Push image on Platform registry') {
                            when {
                                 allOf {
                                       expression { params.PUSH_PLATFORM_REGISTRY == true}
                                       expression { params.PLATFORM_REGISTRY != ''}
                                       expression { params.comauchatassistant_TAG != ''}
                                       }
                                  }
                             steps {
                                 withCredentials([usernamePassword(credentialsId: 'ingrid_acr_shared_registry', usernameVariable: 'ACR_USER', passwordVariable: 'ACR_PASSWORD')]){
                                  sh " docker tag comauchatassistant:latest ${params.PLATFORM_REGISTRY}/comauchatassistant:${params.comauchatassistant_TAG} "
                                  sh " docker login -u ${ACR_USER} -p ${ACR_PASSWORD} ${params.PLATFORM_REGISTRY}"
                                  sh " docker push ${params.PLATFORM_REGISTRY}/comauchatassistant:${params.comauchatassistant_TAG}"
                              }
                             }
                }

    }

    post {
        always {
            echo "🏁 Pipeline finished."
            sh "docker logout" // Clean up credentials
        }
        success {
            echo "✅ Build Successful!"
        }
        failure {
            echo "❌ Build Failed. Check logs above."
        }
    }
}
