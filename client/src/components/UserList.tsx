interface User {
  userId: number;
  username: string;
}

interface Props {
  users: User[];
  hostId?: number;
}

export default function UserList({ users, hostId }: Props) {
  return (
    <div className="user-list">
      <h4>在线用户 ({users.length})</h4>
      <ul>
        {users.map((u, i) => (
          <li key={u.userId + '-' + i}>
            <span className="user-dot" />
            {u.username}
            {u.userId === hostId && <span className="host-badge">房主</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
