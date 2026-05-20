import streamDeck from '@elgato/streamdeck';
import { LaunchOmniscribe } from './actions/launch.js';

streamDeck.actions.registerAction(new LaunchOmniscribe());
streamDeck.connect();
