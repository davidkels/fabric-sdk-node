PEER=~/src/go/src/github.com/hyperledger/fabric/.build/bin/peer
MSP=~/src/go/src/github.com/hyperledger/fabric-sdk-node/fabric-network/test/fabric/composer/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
MSPID=Org1MSP
CORE_PEER_LOCALMSPID=${MSPID} CORE_PEER_MSPCONFIGPATH=${MSP} ${PEER} chaincode query -n demo -c '{"Args":["query","key1"]}' -o 127.0.0.1:7050 -C composerchannel
