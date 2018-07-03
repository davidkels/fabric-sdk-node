./fabric/startFabric.sh -d
PEER=~/src/go/src/github.com/hyperledger/fabric/.build/bin/peer
MSP=~/src/go/src/github.com/hyperledger/fabric-sdk-node/fabric-network/e2e/fabric/composer/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
MSPID=Org1MSP
CORE_PEER_LOCALMSPID=${MSPID} CORE_PEER_MSPCONFIGPATH=${MSP} ${PEER} chaincode install -l node -n demo -p ./dummy -v 0.0.1
