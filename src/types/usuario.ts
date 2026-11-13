export interface UsuarioAutenticado {
  uid: string;
  email?: string;
  nombre?: string;
  foto?: string;
  proveedor: "password" | "google";
}
