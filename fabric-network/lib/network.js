/*
 Copyright 2018 IBM All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

		http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
*/
'use strict';

//TODO: What about chaincode events ?
//TODO: Expose access to the eventhubs

const Client = require('fabric-client');
const TxEventHandler = require('./txeventhandler');
const FABRIC_CONSTANTS = require('fabric-client/lib/Constants');

//let logger = utils.getLogger('Network.js');

class Network {

	/**
     * Create a new Event Handler to listen for txId and chaincode events.
     * @param {array} eventHubs An array of event hubs.
     * @param {string} txId The transaction id string to listen for.
     * @param {number} commitTimeout the commit timeout.
     * @returns {HLFTxEventHandler} the event handler to use.
     * @private
     */
	static createTxEventHandler(eventHubs, txId, commitTimeout) {
		return new TxEventHandler(eventHubs, txId, commitTimeout);
	}

	constructor() {
		this.client = null;
		this.channelStatus = {};
		this.options = {
			commitTimeout: 300 * 1000
		};
		this.wallet = null;
	}

	async initialize(ccp, options) {
		//TODO: initialise from discovery
		this.client = Client.loadFromConfig(ccp);

		// TODO: Need to consider HSM
		Object.assign(this.options, options);
		if (options && options.identity && options.wallet) {
			await options.wallet.setClient(this.client);
			await options.wallet.setUserContext(options.identity);
		}
	}


	_connectEventHubs(channel) {
		//TODO: Need to determine strategy here
		const orgPeers = this.client.getPeersForOrg();
		let eventHubs = this.channelStatus[channel.getName()].eventHubs;
		if (!eventHubs) {
			let eventHubs = [];
			if (orgPeers.length > 0) {
				let eventHub = channel.newChannelEventHub(orgPeers[0]);
				eventHubs.push(eventHub);
				//TODO: need to control this somehow, users may not want full block retrieval
				eventHub.connect(true);
			}
			else {
				throw new Error('No peers in org or no org defined');
			}
			this.channelStatus[channel.getName()].eventHubs = eventHubs;
		}
		return eventHubs;
	}

	getClient() {
		return this.client;
	}

	/**
     * initialize the channel if it hasn't been done, manipulate the peer list in the channel to cycle
     * through ledger peers if any are down. This is a workaround until a better soln from
     * https://jira.hyperledger.org/browse/FAB-10065
     * is available.
     * @private
     */
	async _initializeChannel(channelName) {
		//TODO: Should this work across all peers or just orgs peers.
		const method = '_initializeChannel';

		const channel = this.client.getChannel(channelName);

		/*
		const ledgerPeers = channel.getPeers().filter((cPeer) => {
			console.log(cPeer);
			return cPeer.isInRole(FABRIC_CONSTANTS.NetworkConfig.LEDGER_QUERY_ROLE);
		});
		*/

		//console.log(channel);
		const ledgerPeers = [];
		channel._channel_peers.forEach((cPeer) => {
			if (cPeer.isInRole(FABRIC_CONSTANTS.NetworkConfig.LEDGER_QUERY_ROLE)) {
				ledgerPeers.push(cPeer.getPeer());
			}
		});

		let ledgerPeerIndex = 0;

		// TODO: this needs to work with the new initialize call to channel
		// also ideally we should resort the peer list to be your org first
		while (!this.channelStatus[channelName]) {
			try {
				await channel.initialize();
				this.channelStatus[channelName] = {initialized: true};
			} catch(error) {
				if (ledgerPeerIndex === ledgerPeers.length - 1) {
					throw new Error(`Unable to initalize channel. Attempted to contact ${ledgerPeers.length} Peers. Last error was ${error}`);
				}
				ledgerPeerIndex++;
				const nextPeer = ledgerPeers[ledgerPeerIndex];
				const peerIndex = channel.getPeers().indexOf(nextPeer);
				channel.getPeers().splice(peerIndex, 1);
				channel.getPeers().unshift(nextPeer);
			}
		}
		return channel;
	}

	/**
     * Check for proposal response errors.
     * @private
     * @param {any} responses the responses from the install, instantiate or invoke
     * @param {boolean} isProposal true is the responses are from a proposal
     * @param {regexp} pattern optional regular expression for message which isn't an error
     * @return {Object} number of ignored errors and valid responses
     * @throws if there are no valid responses at all.
     * @private
     */
	_validatePeerResponses(channel, responses) {
		//TODO: This is for handling static CCP interaction, service discovery would need to
		// try other peers.
		const method = '_validatePeerResponses';

		if (!responses.length) {
			throw new Error('No results were returned from the request');
		}

		let validResponses = [];
		let invalidResponseMsgs = [];
		let ignoredErrors = 0;

		responses.forEach((responseContent) => {
			if (responseContent instanceof Error) {
				const warning = `Response from attempted peer comms was an error: ${responseContent}`;
				invalidResponseMsgs.push(warning);
			} else {

				// not an error, if it is from a proposal, verify the response
				if (!channel.verifyProposalResponse(responseContent)) {
					// the node-sdk doesn't provide any external utilities from parsing the responseContent.
					// there are internal ones which may do what is needed or we would have to decode the
					// protobufs ourselves but it should really be the node sdk doing this.
					const warning = `Proposal response from peer failed verification. ${responseContent.response}`;
					invalidResponseMsgs.push(warning);
				} else if (responseContent.response.status !== 200) {
					const warning = `Unexpected response of ${responseContent.response.status}. Payload was: ${responseContent.response.payload}`;
					invalidResponseMsgs.push(warning);
				} else {
					validResponses.push(responseContent);
				}
			}
		});

		if (validResponses.length === 0 && ignoredErrors < responses.length) {
			const errorMessages = [ 'No valid responses from any peers.' ];
			invalidResponseMsgs.forEach(invalidResponse => errorMessages.push(invalidResponse));
			throw new Error(errorMessages.join('\n'));
		}

		return {ignoredErrors, validResponses, invalidResponseMsgs};
	}

	async disconnect() {
		for (let channelName in this.channelStatus) {
			let channelDef = this.channelStatus[channelName];
			if (channelDef.eventHubs[0].isconnected()) {
				channelDef.eventHubs[0].disconnect();
			}
		}
	}


	/**
     *
     * @param {string} channelName channel name
     * @param {string} chaincodeID chaincode id
     * @param {string} transactionName transaction name
     * @param {string[]} parameters transaction parameters
     * @returns {byte[]} payload response
     */
	async submitTransaction(channelName, chaincodeId, transactionName, parameters) {

		//TODO: Need to add support for service discovery if available over static ccp
		//TODO: May want to be able to get the tx id, or provide own txid
		const txId = this.client.newTransactionID();
		const channel = await this._initializeChannel(channelName);
		const eventHubs = this._connectEventHubs(channel);

		// TODO: check eventhubs are ok

		// Submit the transaction to the endorsers.
		const request = {
			chaincodeId,
			txId,
			fcn: transactionName,
			args: parameters
		};
		console.log('sendTxProposal');
		// node-sdk bug
		// the following can throw an error
		/*
got error TypeError: "value" argument must not be a number
    at Function.Buffer.from (buffer.js:186:11)
    at Function._buildSignedProposal (/home/vagrant/src/go/src/github.com/hyperledger/fabric-sdk-node/fabric-client/lib/Channel.js:2335:21)
    at Channel.sendTransactionProposal (/home/vagrant/src/go/src/github.com/hyperledger/fabric-sdk-node/fabric-client/lib/Channel.js:2265:29)
    at Network.submitTransaction (/home/vagrant/src/go/src/github.com/hyperledger/fabric-sdk-node/fabric-network/lib/network.js:226:33)
	at <anonymous>
	*/
		// and then the application hangs

		const results = await channel.sendTransactionProposal(request); // node sdk will target all peers on the channel that are endorsingPeer

		const proposalResponses = results[0];
		let {validResponses} = this._validatePeerResponses(channel, proposalResponses);

		// Submit the endorsed transaction to the primary orderers.
		const proposal = results[1];

		let eventHandler = Network.createTxEventHandler(eventHubs, txId.getTransactionID(), this.options.commitTimeout);
		console.log('start listening');
		eventHandler.startListening();

		// TODO: add HA capability of an orderer is not available
		const response = await channel.sendTransaction({
			proposalResponses: validResponses,
			proposal
		});
		console.log('get response');

		if (response.status !== 'SUCCESS') {
			eventHandler.cancelListening();
			throw new Error(`Failed to send peer responses for transaction '${txId.getTransactionID()}' to orderer. Response status '${response.status}'`);
		}

		console.log('waiting for events');
		await eventHandler.waitForEvents();
		console.log('got events');
		// return the payload from the invoked chaincode
		return proposalResponses[0].response.payload.toString('utf8');

	}

	//TODO: will hang unless we disconnect the event hubs

}


module.exports = Network;
