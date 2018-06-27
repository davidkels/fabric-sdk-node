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


/*
 * This file provides the API specifications for event handling in fabric-network
 */



class EventHandlerFactory {

	constructor(channel, mspId, peerMap, options) {
		this.channel = channel;
		this.peerMap = peerMap;
		this.options = options;
		this.mspId = mspId;

		// available event hubs, not necessarily connected event hubs, just ones that
		// are available to be tried
		this.availableEventHubs = [];
	}

	addEventHub(eventHub) {
		this.availableEventHubs.push(eventHub);
	}

	getEventHubs() {
		return this.availableEventHubs;
	}

	setEventHubs(availableEventHubs) {
		this.availableEventHubs = availableEventHubs;
	}

	/**
     * check the status of the event hubs and attempt to reconnect any event hubs.
     */
	checkEventhubs() {
		for(const hub of this.availableEventHubs) {
			hub.checkConnection(true);
		}
	}

	disconnect() {
		for (const hub of this.availableEventHubs) {
			try {
				hub.disconnect();
			} catch (error) {
				//
			}
		}
	}

	chaincodeEventsEnabled() {
		return false;
	}

	createChaincodeEventHandler(chaincodeId, eventName) {
		throw new Error('not implemented');
	}

	createTxEventHandler(txid) {
		throw new Error('not implemented');
	}

	//TODO: what should we do here ?
	getBlockEventHandler() {
		throw new Error('not implemented');
	}
}


class TxEventHandler {

	/**
     * Construct a Tx Event Handler.
     * @param {EventHub[]} eventHubs the event hubs to listen for tx events
     * @param {String} txId the txid that is driving the events to occur
     * @param {Integer} timeout how long (in seconds) to wait for events to occur.
     */
	constructor(eventHubs, strategy, mspId, txId, timeout) {
		if (!eventHubs || eventHubs.length === 0) {
			throw new Error('No event hubs defined');
		}
		this.eventHubs = eventHubs;
		this.strategy = strategy;
		this.txId = txId || '';
		this.mspId = mspId;
		this.timeout = (timeout || 0) * 1000;

		this.notificationPromise;
		this.timeoutHandle;
	}

	/**
     * Start listening for events.
     */
	startListening() {
		throw new Error('Not implemented');
	}

	/**
     * wait for all event hubs to send the tx event.
     * @returns {Promise} a promise which is resolved when all the events have been received, rejected if an error occurs.
     */
	async waitForEvents() {
		throw new Error('Not implemented');
	}

	/**
     * cancel listening for events
     */
	cancelListening() {
		throw new Error('Not implemented');
	}
}


module.exports = {
	EventHandlerFactory,
	TxEventHandler
};
