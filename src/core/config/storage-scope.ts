import { Base64 } from 'js-base64';
import { env } from './env';
export const storageScope = env.demo ? 'demo' : Base64.encodeURI(env.apiUrl || 'unconfigured');
