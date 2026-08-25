import speakerViewHTML from './speaker-view.html?raw'

import { marked } from 'marked';

/**
 * Handles opening of and synchronization with the reveal.js
 * notes window.
 *
 * Handshake process:
 * 1. This window posts 'connect' to notes window
 *    - Includes URL of presentation to show
 * 2. Notes window responds with 'connected' when it is available
 * 3. This window proceeds to send the current presentation state
 *    to the notes window
 */
const Plugin = () => {

	let connectInterval;
	let speakerWindow = null;
	let speakerCloseCheckInterval = null;
	let speakerRelayMode = false;
	let presentDualScreenStarted = false;
	let notesConnected = false;
	let deck;

	const NOTES_SYNC_EVENTS = [
		'slidechanged',
		'fragmentshown',
		'fragmenthidden',
		'overviewhidden',
		'overviewshown',
		'paused',
		'resumed',
		'previewiframe',
		'previewimage',
		'previewvideo',
		'closeoverlay',
	];

	function getParams() {
		return new URLSearchParams(window.location.search);
	}

	function isPlatformPresentDualScreen() {
		return (
			getParams().get('audience') === '1' &&
			getParams().get('presentShell') === '1' &&
			window.opener &&
			!window.opener.closed
		);
	}

	function isSpeakerTargetOpen() {
		if (!speakerWindow) return false;
		if (speakerRelayMode) {
			try {
				return Boolean(window.opener && !window.opener.closed);
			} catch (error) {
				return false;
			}
		}
		return !speakerWindow.closed;
	}

	function postToSpeakerTarget(messageData) {
		const payload = JSON.stringify(messageData);
		if (speakerRelayMode) {
			const namespace = messageData.namespace || 'reveal-notes';
			window.opener.postMessage(
				JSON.stringify({
					type: 'platform-present:relay',
					namespace,
					payload: messageData,
				}),
				'*'
			);
			return;
		}
		speakerWindow.postMessage(payload, '*');
	}

	function notifySpeakerViewOpen() {
		if (!isSpeakerTargetOpen()) return;
		if (speakerRelayMode) {
			window.dispatchEvent(
				new CustomEvent('platform-speaker-view-opened', {
					detail: { mode: 'relay', relayWindow: window.opener },
				})
			);
			return;
		}
		window.dispatchEvent(
			new CustomEvent('platform-speaker-view-opened', { detail: { window: speakerWindow } })
		);
		startSpeakerCloseCheck();
	}

	function notifySpeakerViewClosed() {
		window.dispatchEvent(new CustomEvent('platform-speaker-view-closed'));
		stopSpeakerCloseCheck();
	}

	function startSpeakerCloseCheck() {
		stopSpeakerCloseCheck();
		if (speakerRelayMode) {
			return;
		}
		speakerCloseCheckInterval = setInterval(function () {
			if (speakerWindow && speakerWindow.closed) {
				speakerWindow = null;
				notifySpeakerViewClosed();
			}
		}, 500);
	}

	function stopSpeakerCloseCheck() {
		if (speakerCloseCheckInterval) {
			clearInterval(speakerCloseCheckInterval);
			speakerCloseCheckInterval = null;
		}
	}

	/**
	 * Opens a new speaker view window.
	 */
	function audienceDeckUrlForSpeaker() {
		const presentationURL = deck.getConfig().url;
		const rawUrl = typeof presentationURL === 'string' ? presentationURL :
			window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search;
		try {
			const parsed = new URL(rawUrl, window.location.origin);
			parsed.searchParams.delete('presentShell');
			parsed.searchParams.delete('audience');
			return parsed.pathname + parsed.search + parsed.hash;
		} catch (error) {
			return rawUrl;
		}
	}

	function schedulePresentDualScreen() {
		if ( !isPlatformPresentDualScreen() ) return;
		var started = false;
		function go() {
			if ( started ) return;
			started = true;
			startPresentDualScreen();
		}
		window.addEventListener( 'platform-bridge:bootstrap-ready', go, { once: true } );
		setTimeout( go, 2500 );
	}

	function startPresentDualScreen() {
		if (presentDualScreenStarted || !isPlatformPresentDualScreen()) return;
		presentDualScreenStarted = true;
		speakerRelayMode = true;
		speakerWindow = window.opener;
		window.opener.postMessage(
			JSON.stringify({
				type: 'platform-present:register-audience',
				sessionId: getParams().get('session') || undefined,
			}),
			'*'
		);
		connect(audienceDeckUrlForSpeaker());
	}

	/**
	 * Opens a new speaker view window.
	 */
	function openSpeakerWindow() {

		if (isPlatformPresentDualScreen()) {
			startPresentDualScreen();
			return;
		}

		// If a window is already open, focus it
		if( speakerWindow && !speakerWindow.closed ) {
			speakerWindow.focus();
			notifySpeakerViewOpen();
		}
		else {
			speakerRelayMode = false;
			speakerWindow = window.open( 'about:blank', 'reveal.js - Notes', 'width=1100,height=700' );
			speakerWindow.marked = marked;
			speakerWindow.document.write( speakerViewHTML );

			if( !speakerWindow ) {
				alert( 'Speaker view popup failed to open. Please make sure popups are allowed and reopen the speaker view.' );
				return;
			}

			connect();
		}

	}

	/**
	 * Reconnect with an existing speaker view window.
	 */
	function reconnectSpeakerWindow( reconnectWindow ) {

		if( speakerWindow && !speakerWindow.closed ) {
			speakerWindow.focus();
		}
		else {
			speakerWindow = reconnectWindow;
			window.addEventListener( 'message', onPostMessage );
			onConnected();
		}

	}

	/**
		* Connect to the notes window through a postmessage handshake.
		* Using postmessage enables us to work in situations where the
		* origins differ, such as a presentation being opened from the
		* file system.
		*/
	function connect( presentationUrlOverride ) {

		const presentationURL = presentationUrlOverride || deck.getConfig().url;

		const url = typeof presentationURL === 'string' ? presentationURL :
								window.location.protocol + '//' + window.location.host + window.location.pathname + window.location.search;

		// Keep trying to connect until we get a 'connected' message back
		if ( connectInterval ) {
			clearInterval( connectInterval );
		}
		connectInterval = setInterval( function() {
			postToSpeakerTarget({
				namespace: 'reveal-notes',
				type: 'connect',
				state: deck.getState(),
				url
			});
		}, 500 );

		window.addEventListener( 'message', onPostMessage );

	}

	/**
	 * Calls the specified Reveal.js method with the provided argument
	 * and then pushes the result to the notes frame.
	 */
	function callRevealApi( methodName, methodArguments, callId ) {

		let result = deck[methodName].apply( deck, methodArguments );
		postToSpeakerTarget({
			namespace: 'reveal-notes',
			type: 'return',
			result,
			callId
		});

	}

	/**
	 * Posts the current slide data to the notes window.
	 */
	function post( event ) {

		let slideElement = deck.getCurrentSlide(),
			notesElements = slideElement.querySelectorAll( 'aside.notes' ),
			fragmentElement = slideElement.querySelector( '.current-fragment' );

		let messageData = {
			namespace: 'reveal-notes',
			type: 'state',
			notes: '',
			markdown: false,
			whitespace: 'normal',
			state: deck.getState()
		};

		// Look for notes defined in a slide attribute
		if( slideElement.hasAttribute( 'data-notes' ) ) {
			messageData.notes = slideElement.getAttribute( 'data-notes' );
			messageData.whitespace = 'pre-wrap';
		}

		// Look for notes defined in a fragment
		if( fragmentElement ) {
			let fragmentNotes = fragmentElement.querySelector( 'aside.notes' );
			if( fragmentNotes ) {
				messageData.notes = fragmentNotes.innerHTML;
				messageData.markdown = typeof fragmentNotes.getAttribute( 'data-markdown' ) === 'string';

				// Ignore other slide notes
				notesElements = null;
			}
			else if( fragmentElement.hasAttribute( 'data-notes' ) ) {
				messageData.notes = fragmentElement.getAttribute( 'data-notes' );
				messageData.whitespace = 'pre-wrap';

				// In case there are slide notes
				notesElements = null;
			}
		}

		// Look for notes defined in an aside element
		if( notesElements && notesElements.length ) {
			// Ignore notes inside of fragments since those are shown
			// individually when stepping through fragments
			notesElements = Array.from( notesElements ).filter( notesElement => notesElement.closest( '.fragment' ) === null );

			messageData.notes = notesElements.map( notesElement => notesElement.innerHTML ).join( '\n' );
			messageData.markdown = notesElements[0] && typeof notesElements[0].getAttribute( 'data-markdown' ) === 'string';
		}

		postToSpeakerTarget(messageData);

	}

	/**
	 * Check if the given event is from the same origin as the
	 * current window.
	 */
	function isSameOriginEvent( event ) {

		try {
			return window.location.origin === event.source.location.origin;
		}
		catch ( error ) {
			return false;
		}

	}

	function isAllowedMessageEvent( event ) {
		if (isSameOriginEvent(event)) return true;
		if (
			speakerRelayMode &&
			event.source === window.opener &&
			typeof event.data === 'string'
		) {
			try {
				const data = JSON.parse(event.data);
				return (
					data &&
					typeof data.type === 'string' &&
					(data.type.startsWith('platform-present:') || data.type === 'platform-present:relay')
				);
			} catch (error) {
				return false;
			}
		}
		return false;
	}

	function unwrapRelayMessage(data) {
		if (
			data &&
			data.type === 'platform-present:relay' &&
			typeof data.namespace === 'string' &&
			data.payload &&
			typeof data.payload === 'object'
		) {
			return data.payload;
		}
		return data;
	}

	function onPostMessage( event ) {

		if( !isAllowedMessageEvent( event ) ) {
			return;
		}

		try {
			let data = JSON.parse( event.data );
			data = unwrapRelayMessage(data);
			if( data && data.namespace === 'reveal-notes' && data.type === 'connected' ) {
				clearInterval( connectInterval );
				onConnected();
			}
			else if( data && data.namespace === 'reveal-notes' && data.type === 'call' ) {
				callRevealApi( data.methodName, data.arguments, data.callId );
			}
			else if (data && data.type === 'platform-present:audience-closed') {
				disconnectNotesRelay();
				speakerWindow = null;
				speakerRelayMode = false;
				// Clear one-shot so Teach remount / request-register can re-handshake.
				presentDualScreenStarted = false;
				clearInterval( connectInterval );
			}
			else if (data && data.type === 'platform-present:request-register') {
				if ( isPlatformPresentDualScreen() ) {
					presentDualScreenStarted = false;
					startPresentDualScreen();
				}
			}
	  } catch (e) {}

	}

	function disconnectNotesRelay() {
		if ( !notesConnected ) {
			return;
		}
		notesConnected = false;
		NOTES_SYNC_EVENTS.forEach( function( eventName ) {
			deck.off( eventName, post );
		} );
		notifySpeakerViewClosed();
	}

	/**
	 * Called once we have established a connection to the notes
	 * window.
	 */
	function onConnected() {

		if ( notesConnected ) {
			return;
		}
		notesConnected = true;

		// Monitor events that trigger a change in state
		NOTES_SYNC_EVENTS.forEach( function( eventName ) {
			deck.on( eventName, post );
		} );

		// Post the initial state
		post();

		notifySpeakerViewOpen();

	}

	return {
		id: 'notes',

		init: function( reveal ) {

			deck = reveal;

			if( !/receiver/i.test( window.location.search ) ) {

				// If the there's a 'notes' query set, open directly
				if( window.location.search.match( /(\?|\&)notes/gi ) !== null ) {
					openSpeakerWindow();
				}
				else if (isPlatformPresentDualScreen()) {
					deck.on('ready', function () {
						schedulePresentDualScreen();
					});
					if (deck.isReady()) {
						schedulePresentDualScreen();
					}
				}
				else {
					// Keep listening for speaker view heartbeats. If we receive a
					// heartbeat from an orphaned window, reconnect it. This ensures
					// that we remain connected to the notes even if the presentation
					// is reloaded.
					window.addEventListener( 'message', event => {

						if( !speakerWindow && typeof event.data === 'string' ) {
							let data;

							try {
								data = JSON.parse( event.data );
							}
							catch( error ) {}

							if( data && data.namespace === 'reveal-notes' && data.type === 'heartbeat' ) {
								reconnectSpeakerWindow( event.source );
							}
						}
					});
				}

				// Open the notes when the 's' key is hit
				deck.addKeyBinding({keyCode: 83, key: 'S', description: 'Speaker notes view'}, function() {
					openSpeakerWindow();
				} );

			}

		},

		open: openSpeakerWindow
	};

};

export default Plugin;
