/**
 * Una plantilla por tipo de correo. Son funciones puras de strings (el Worker tiene 10 ms de CPU por request):
 * reciben los datos ya leídos y devuelven asunto, HTML, texto plano y encabezados.
 */
export * from "./account";
export * from "./alert";
export * from "./internal";
export * from "./weekly";
export type { EmailMessage } from "../message";
