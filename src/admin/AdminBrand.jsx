import { MessagesSquare } from 'lucide-react';
export default function AdminBrand() {
  return <a className="brand mnchat-brand" href="/admin.html" aria-label="Mnchat Admin home"><span className="mnchat-symbol"><MessagesSquare size={26}/></span><span>Mnchat<small>ADMIN CONSOLE</small></span></a>;
}
