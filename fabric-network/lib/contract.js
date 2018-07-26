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

const EventEmitter = require('events');

class Contract extends EventEmitter {

	constructor(channel, chaincodeId, eventHandlerFactory, queryHandler, network) {
		super();
		this.channel = channel;
		this.chaincodeId = chaincodeId;
		this.eventHandlerFactory = eventHandlerFactory;
		this.network = network;
		this.queryHandler = queryHandler;

		if (this.eventHandlerFactory && this.eventHandlerFactory.chaincodeEventsEnabled()) {
			this.once('newListener', (eventName, listener) => {
				this.eventHandlerFactory.createChaincodeEventHandler(chaincodeId, eventName).on('chaincodeEvent'/* or eventName*/, (event) => {
					this.emit(eventName, event);
				});
			});
			// cleanup of the chaincode listeners is done when the network is cleaned up.
		}
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
	_validatePeerResponses(responses) {
		if (!responses.length) {
			throw new Error('No results were returned from the request');
		}

		const validResponses = [];
		const invalidResponseMsgs = [];
		const ignoredErrors = 0;

		responses.forEach((responseContent) => {
			if (responseContent instanceof Error) {
				const warning = `Response from attempted peer comms was an error: ${responseContent}`;
				invalidResponseMsgs.push(warning);
			} else {

				// not an error, if it is from a proposal, verify the response
				if (!this.channel.verifyProposalResponse(responseContent)) {
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

	/**
     * @param {string} transactionName transaction name
     * @param {string[]} parameters transaction parameters
     * @returns {byte[]} payload response
     */
	async query(transactionName, parameters, txId) {
		if (!txId) {
			txId = this.network.getClient().newTransactionID();
		}
		let result = await this.queryHandler.queryChaincode(this.chaincodeId, transactionName, parameters, txId);
		return result ? result : null;
	}

	/**
     * @param {string} transactionName transaction name
     * @param {string[]} parameters transaction parameters
	 * @param {TransactionId} txId optional own transactionId to use
     * @returns {byte[]} payload response
     */
	async submitTransaction(transactionName, parameters, txId) {

		if (!txId) {
			txId = this.network.getClient().newTransactionID();
		}

		// TODO: check eventhubs are ok

		// Submit the transaction to the endorsers.
		const request = {
			chaincodeId: this.chaincodeId,
			txId,
			fcn: transactionName,
			args: parameters
		};

		// node sdk will target all peers on the channel that are endorsingPeer or do something special for a discovery environment
		const results = await this.channel.sendTransactionProposal(request);
		const proposalResponses = results[0];
		let {validResponses} = this._validatePeerResponses(proposalResponses);

		// Submit the endorsed transaction to the primary orderers.
		const proposal = results[1];

		let eventHandler;
		if (this.eventHandlerFactory) {
			eventHandler = this.eventHandlerFactory.createTxEventHandler(txId.getTransactionID());
			eventHandler.startListening();
		}

		const response = await this.channel.sendTransaction({
			proposalResponses: validResponses,
			proposal
		});

		if (response.status !== 'SUCCESS') {
			eventHandler.cancelListening();
			throw new Error(`Failed to send peer responses for transaction '${txId.getTransactionID()}' to orderer. Response status '${response.status}'`);
		}

		console.log('waiting for events');
		if (eventHandler) {
			await eventHandler.waitForEvents();
		}
		console.log('got events');
		// return the payload from the invoked chaincode
		console.log('returns: ', proposalResponses[0].response.payload);

		return proposalResponses[0].response.payload;

	}

	getEventHubs() {
		if (this.eventHandlerFactory) {
			return this.eventHandlerFactory.getEventHubs();
		}
		return [];
	}

}

module.exports = Contract;
