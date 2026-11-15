/** Lógica pura de la sesión de demostración (sin React Native, para probarla). */
/** ¿Esta organización es la de la demo guardada? */
export const isDemoOrg = (storedOrgId: string | null, orgId: string | null | undefined): boolean => !!storedOrgId && !!orgId && storedOrgId === orgId;

/** Solo lectura: la demo manda sobre la elección guardada (el interruptor no la apaga). */
export const forceReadOnly = (demo: boolean, resolved: boolean): boolean => demo || resolved;
