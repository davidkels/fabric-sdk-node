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

const {TxEventHandler} = require('../../api/eventhandler');
const EventHandlerConstants = require('./defaulteventstrategies');

const STRATEGY_PASSED = 1;
const STRATEGY_STILLONGOING = 0;
const STRATEGY_FAILED = -1;

class DefaultTxEventHandler extends TxEventHandler {


	/**
     * Construct a Tx Event Handler.
     * @param {EventHub[]} eventHubs the event hubs to listen for tx events
     * @param {String} txId the txid that is driving the events to occur
     * @param {Integer} timeout how long (in seconds) to wait for events to occur.
     */
	constructor(factory, txId) {
		super();
		this.eventHubs = factory.getEventHubs();
		if (!this.eventHubs || this.eventHubs.length === 0) {
			throw new Error('No event hubs defined');
		}
		if (!txId) {
			throw new Error('No transaction id provided');
		}
		this.factory = factory;
		this.txId = txId;
		this.mspId = factory.mspId;
		this.options = factory.options;

		this.eventsByMspId = null;
		this.notificationPromise = null;
		this.timeoutHandle = null;

		// build the strategy map
		this.strategyMap = new Map([
			[EventHandlerConstants.MSPID_SCOPE_ALLFORTX, {
				checkInitialState: this._checkInitialCountByMspId,
				eventReceived: this._checkRemainingEventsForMspId,
				errorReceived: this._checkRemainingEventsForMspId
			}],
			[EventHandlerConstants.MSPID_SCOPE_ANYFORTX, {
				checkInitialState: this._checkInitialCountByMspId,
				eventReceived: () => { return STRATEGY_PASSED;},
				errorReceived: this._checkRemainingEventsForMspId
			}],
			[EventHandlerConstants.CHANNEL_SCOPE_ALLFORTX, {
				checkInitialState: this._checkInitialCountByMspId,
				eventReceived: this._checkEachMspIdForEvents,
				errorReceived: this._checkEachMspIdForEvents
			}],
			[EventHandlerConstants.CHANNEL_SCOPE_ANYFORTX, {
				checkInitialState: this._checkInitialCountTotal,
				eventReceived: () => { return STRATEGY_PASSED;},
				errorReceived: this._checkRemainingEventsForAll
			}],
		]);
	}


	/**
	 * check that each MSPid has at least 1 event hub. If we have only connected to event hubs
	 * of a specific mspid, then there will only be a single MSPid set to check
	 *
	 * @memberof DefaultTxEventHandler
	 */
	async _checkInitialCountByMspId() {
		console.log('eventCount', this.eventsByMspId);
		let reestablish = false;
		if (this.eventsByMspId.size === 0) {
			reestablish = true;
		}
		this.eventsByMspId.forEach((entry) => {
			if (entry.initial < 1) {
				reestablish = true;
			}
		});
		if (reestablish) {
			await this.factory._establishEventHubsForStrategy();
		}

		if (this.eventsByMspId.size === 0) {
			throw new Error('no event hubs available');
		}
		this.eventsByMspId.forEach((entry) => {
			if (entry.initial < 1) {
				// try to recover the event hubs ?
				throw new Error('not enough connected event hubs to satisfy strategy');
			}
		});

	}

	/**
	 * check that there is at least 1 event hub
	 *
	 * @memberof DefaultTxEventHandler
	 */
	async _checkInitialCountTotal() {
		let total = 0;
		this.eventsByMspId.forEach((entry) => {
			total += entry.initial;
		});
		if (total < 1) {
			await this.factory._establishEventHubsForStrategy();
			this.eventsByMspId.forEach((entry) => {
				total += entry.initial;
			});
			if (total < 1) {
				throw new Error('not enough connected event hubs to satisfy strategy');
			}
		}
	}


	/**
	 * Check event hubs for an MSPid. If all event hubs have returned or errored
	 * and we have at least 1 valid response then that is a pass, otherwise it's
	 * a fail. However we are still onging if there are still outstanding events
	 * for this mspId
	 * Can be called for both error and event processing. for event processing
	 * count.valid will always be > 0.
	 *
	 * @param {*} mspId
	 * @param {*} count
	 * @returns
	 * @memberof DefaultTxEventHandler
	 */
	_checkRemainingEventsForMspId(mspId, count) {
		if (count.remaining < 1) {
			if (count.valid > 0) {
				return STRATEGY_PASSED;
			} else {
				return STRATEGY_FAILED;
			}
		}
		return STRATEGY_STILLONGOING;
	}

	/**
	 * for both event and error handling.
	 * check each MSP id to see if they have at least 1 valid event or could still receive
	 * a valid event if none received. Determines if it's either passed, failed or still
	 * possible.
	 *
	 * @param {*} mspid
	 * @param {*} count
	 * @returns
	 * @memberof DefaultTxEventHandler
	 */
	_checkEachMspIdForEvents(mspid, count) {
		let passed = true;
		let failed = false;

		// TODO: forEach is the wrong way to iterate here
		this.eventsByMspId.forEach((entry) => {
			if (entry.valid === 0) {
				if (entry.remaining === 0) {
					failed = true;
				} else {
					passed = false;
				}
			}
		});

		if (passed) {
			return STRATEGY_PASSED;
		}
		if (failed) {
			return STRATEGY_FAILED;
		}

		return STRATEGY_STILLONGOING;
	}

	/**
	 * on error event only, if there are no event handlers left, this is a strategy failure.
	 *
	 * @param {*} mspId
	 * @param {*} count
	 * @returns
	 * @memberof DefaultTxEventHandler
	 */
	_checkRemainingEventsForAll(mspId, count) {
		let totalleft = 0;

		this.eventsByMspId.forEach((entry) => {
			totalleft += entry.remaining;
		});

		if (totalleft === 0) {
			return STRATEGY_FAILED;
		}

		return STRATEGY_STILLONGOING;
	}



	async _getConnectedHubs() {
		// requires that we know that all connect requests have been processed (either successfully or failed to connect)
		const connectedHubs = [];
		this.eventsByMspId = new Map();
		for (const eventHub of this.eventHubs) {
			// we can guarantee that at this point if an event hub could be connected then
			// it will have been flagged as connected.
			if (eventHub.isconnected()) {
				connectedHubs.push(eventHub);
				let count = this.eventsByMspId.get(eventHub._EVH_mspId);
				if (!count) {

					// initial number of connected event hubs for the mspid
					// along with the remaining number of event hubs to respond
					count = {initial: 1, remaining: 1};
					this.eventsByMspId.set(eventHub._EVH_mspId, count);
				} else {
					count.initial++;
					count.remaining++;
				}
			} else {
				console.log('event hub not connected');
			}
		}

		const connectStrategy = this.strategyMap.get(this.options.strategy);
		await connectStrategy.checkInitialState.call(this);

		return connectedHubs;
	}

	_checkStrategyStatus(mspId, errorReceived) {
		const count = this.eventsByMspId.get(mspId);
		count.remaining--;
		if (!errorReceived) {
			count.valid = count.valid ? count.valid + 1 : 1;
		}
		this.eventsByMspId.set(mspId, count);

		const connectStrategy = this.strategyMap.get(this.options.strategy);
		if (!errorReceived) {
			return connectStrategy.eventReceived.call(this, mspId, count);
		} else {
			return connectStrategy.errorReceived.call(this, mspId, count);
		}
	}

	/**
     * Start listening for events.
     */
	async startListening() {

		// - check that there are enough and correct connected event hubs to satisfy strategy
		this.connectedHubs = await this._getConnectedHubs();

		let txResolve, txReject;

		// set up a single promise and break out the promise handlers
		// - A single promise held which resolves when enough events are received or rejects if err handler fires
		//   which would break the strategy
		this.notificationPromise = new Promise((resolve, reject) => {
			txResolve = resolve;
			txReject = reject;
		});


		// create a single timeout handler which rejects the single promise if it fires
		this.timeoutHandle = setTimeout(() => {
			this.cancelListening();
			txReject(new Error('Event strategy not satisified within the timeout period'));
		}, this.options.timeout * 1000);

		for (const hub of this.connectedHubs) {
			console.log('registering for event');

			// - when enough events are received, strategy broken, timeout fires, should unregister all txevent listeners
			hub.registerTxEvent(this.txId,
				(tx, code) => {
					console.log(new Date(), 'got event');
					hub.unregisterTxEvent(this.txId);
					if (code !== 'VALID') {
						this.cancelListening();
						txReject(new Error(`Peer ${hub.getPeerAddr()} has rejected transaction '${this.txId}' with code ${code}`));
					} else {
						if (this._checkStrategyStatus(hub._EVH_mspId, false) === STRATEGY_PASSED) {
							this.cancelListening();
							txResolve();
						}
					}
				},
				(err) => {
					console.log('got an error', err);
					hub.unregisterTxEvent(this.txId);
					const strategyStatus = this._checkStrategyStatus(hub._EVH_mspId, true);
					if (strategyStatus !== STRATEGY_STILLONGOING) {
						this.cancelListening();
						if (strategyStatus === STRATEGY_FAILED) {
							txReject(new Error('not possible to satisfy the event strategy due to loss of event hub comms'));
						}
						// a failure of an event hub could still mean the strategy was satisfied
						// eg we are waiting for all and got some, but the last one just failed
						txResolve();
					}
				}
			);

		}

	}

	/**
     * wait for all event hubs to send the tx event.
     * @returns {Promise} a promise which is resolved when all the events have been received, rejected if an error occurs.
     */
	async waitForEvents() {
		console.log('inside waitForEvents');
		if (this.notificationPromise) {
			console.log(new Date(), 'about to await');
			await this.notificationPromise;
			console.log(new Date(), 'unblocked');
		} else {
			throw new Error('cannot wait for notification');
		}
	}

	/**
     * cancel listening for events
     */
	async cancelListening() {
		clearTimeout(this.timeoutHandle);
		for (const hub of this.connectedHubs) {
			hub.unregisterTxEvent(this.txId);
		}
	}
}

module.exports = DefaultTxEventHandler;
