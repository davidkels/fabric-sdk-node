PEER=~/src/go/src/github.com/hyperledger/fabric/.build/bin/peer
MSP=~/src/go/src/github.com/hyperledger/fabric-sdk-node/fabric-network/e2e/fabric/composer/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
MSPID=Org1MSP
CORE_CHAINCODE_ID_NAME="demo:0.0.1" node e2e/simpleChaincode.js --peer.address grpc://localhost:7052 &
CORE_PEER_LOCALMSPID=${MSPID} CORE_PEER_MSPCONFIGPATH=${MSP} ${PEER} chaincode instantiate -o localhost:7050 -C composerchannel -l node -n demo -v 0.0.1 -c '{"Args":["init", "key1", "1", "key2", "2"]}'
