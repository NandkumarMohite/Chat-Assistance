#!/bin/bash

#sudo update-ca-certificates

DCT_PATH=$1
USER=comau_signer_ci
DOCKER_CONTENT_TRUST_ROOT_PASSPHRASE=$2
DOCKER_CONTENT_TRUST_REPOSITORY_PASSPHRASE=$3
DOCKER_REPO=$4
IMAGE_TAG=$5
NOTARY_ADDRESS=$6

#export DOCKER_CONTENT_TRUST_SERVER=$NOTARY_ADDRESS
#export DOCKER_CONTENT_TRUST=1
#
#
#grep -r $USER ~/.docker/trust/private/
#if [ "$?" -eq "1" ]
#then
# echo "please contact administration to load private key to create the root key"
# exit 1
#fi
#
#docker trust inspect --pretty $DOCKER_REPO | grep $USER
#if [ "$?" -eq "1" ]
#then
#docker trust signer add --key $DCT_PATH/comau_delegation.crt $USER $DOCKER_REPO
#fi
#
#docker trust sign "$DOCKER_REPO:$IMAGE_TAG"
docker push "$DOCKER_REPO:$IMAGE_TAG"