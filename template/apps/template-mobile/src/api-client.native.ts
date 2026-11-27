import { createApi } from './api';
import { authClient } from './auth-client.native';
import { withSession } from './session';
import { withTimeout } from './timeout';

export const api = createApi(withTimeout(withSession(() => authClient.getCookie())));
