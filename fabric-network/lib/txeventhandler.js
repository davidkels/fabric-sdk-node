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

class TxEventHandler {

    /**
     * Construct a Tx Event Handler.
     * @param {EventHub[]} eventHubs the event hubs to listen for tx events
     * @param {String} txId the txid that is driving the events to occur
     * @param {Integer} timeout how long (in seconds) to wait for events to occur.
     */
    constructor(eventHubs, txId, timeout) {
        const method = 'constructor';
        this.eventHubs = eventHubs || [];
        this.txId = txId || '';
        this.listenerPromises = [];
        this.timeoutHandles = [];
        this.timeout = timeout || 0;
    }

    /**
     * Start listening for events.
     */
    startListening() {
        const method = 'startListening';

        this.eventHubs.forEach((eh) => {
            if (eh.isconnected()) {

                let handle;
                let txPromise = new Promise((resolve, reject) => {
                    handle = setTimeout(() => {
                        eh.unregisterTxEvent(this.txId);

                        // We reject to let the application know that the commit did not complete within the timeout
                        reject(new Error(`Failed to receive commit notification from ${eh.getPeerAddr()} for transaction '${this.txId}' within the timeout period`));
                    }, this.timeout);

                    eh.registerTxEvent(this.txId,
                        (tx, code) => {
                            clearTimeout(handle);
                            eh.unregisterTxEvent(this.txId);
                            if (code !== 'VALID') {
                                reject(new Error(`Peer ${eh.getPeerAddr()} has rejected transaction '${this.txId}' with code ${code}`));
                            } else {
                                resolve();
                            }
                        },
                        (err) => {
                            clearTimeout(handle);
                            eh.unregisterTxEvent(this.txId);

                            // We resolve rather than reject as we can still wait for other peers.
                            resolve();
                        }
                    );
                });
                this.listenerPromises.push(txPromise);
                this.timeoutHandles.push(handle);
            }
        });
    }

    /**
     * wait for all event hubs to send the tx event.
     * @returns {Promise} a promise which is resolved when all the events have been received, rejected if an error occurs.
     */
    waitForEvents() {
        const method = 'waitForEvents';
        if (this.listenerPromises.length > 0) {
            return Promise.all(this.listenerPromises);
        }
        return Promise.resolve();
    }

    /**
     * cancel listening for events
     */
    cancelListening() {
        const method = 'cancelListening';
        this.timeoutHandles.forEach((handle) => {
            clearTimeout(handle);
        });
        this.eventHubs.forEach((eh) => {
            eh.unregisterTxEvent(this.txId);
        });
    }
}

module.exports = TxEventHandler;
