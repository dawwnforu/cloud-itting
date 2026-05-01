import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-brand">☁ 云同坐</Link>
        <Link to="/" className="nav-link">房间</Link>
        <Link to="/history" className="nav-link">历史</Link>
      </div>
      <div className="navbar-right">
        <span className="nav-user">{user.username}</span>
        <button onClick={handleLogout} className="btn btn-sm btn-outline">
          退出
        </button>
      </div>
    </nav>
  );
}
