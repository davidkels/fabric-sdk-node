source ./setup.sh

CORE_PEER_LOCALMSPID=${MSPID} CORE_PEER_MSPCONFIGPATH=${MSP} ${PEER} chaincode instantiate -o localhost:7050 -C composerchannel -l node -n demo -v 0.0.1 -c '{"Args":["init", "key1", "1", "key2", "2"]}'
