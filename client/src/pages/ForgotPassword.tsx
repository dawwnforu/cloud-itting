import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.resetPassword({ email, newPassword });
      setSuccess('密码重置成功！请返回登录页使用新密码登录。');
      setEmail('');
      setNewPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>找回密码</h1>
        <p className="auth-subtitle">输入注册邮箱，设置新密码</p>
        <form onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}
          {success && <div className="success-msg">{success}</div>}
          <input
            type="email"
            placeholder="注册邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder="新密码（至少6位）"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
          />
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? '提交中...' : '重置密码'}
          </button>
        </form>
        <p className="auth-switch">
          <Link to="/login">返回登录</Link>
        </p>
      </div>
    </div>
  );
}
