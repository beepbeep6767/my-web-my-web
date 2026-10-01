import { MessageCircle, X } from 'lucide-react';
import Media from './Media.jsx';
export function Brand() { return <a className="brand" href="/" aria-label="MNChat home"><span className="brand-mark"><MessageCircle size={23} strokeWidth={2.5}/></span><span>MN<span className="brand-light">Chat</span><small>BETTER TOGETHER</small></span></a>; }
export function Avatar({ user, size = '', className = '' }) { return <span className={`avatar ${size} ${className}`}>{user?.avatarId ? <Media id={user.avatarId} alt=""/> : (user?.username?.slice(0, 2) || '?').toUpperCase()}</span>; }
export function ErrorNotice({ message, onClose }) { return message ? <div className="error-notice" role="alert"><span>{message}</span>{onClose && <button className="icon-button" aria-label="Dismiss message" onClick={onClose}><X size={16}/></button>}</div> : null; }
export function Empty({ icon: Icon = MessageCircle, title, children }) { return <div className="empty"><span className="empty-icon"><Icon size={28}/></span><h3>{title}</h3><p>{children}</p></div>; }

