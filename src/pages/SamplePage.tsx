import { useEffect, useState } from 'react';
import PageMeta from '@/components/common/PageMeta';
import { supabase } from '@/utils/supabase';

type Todo = {
  id: number;
  name: string;
};

export default function SamplePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getTodos() {
      const { data, error } = await supabase.from<Todo>('todos').select('*');

      if (error) {
        setError(error.message);
        return;
      }

      if (data) {
        setTodos(data);
      }
    }

    getTodos();
  }, []);

  return (
    <>
      <PageMeta title="Home" description="Home Page Introduction" />
      <div>
        <h3>Supabase Todo Demo</h3>
        {error && <div className="text-red-500">{error}</div>}
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>{todo.name}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
