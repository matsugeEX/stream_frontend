import Link from "next/link";

const rooms = [
  {
    name: "test_room",
    title: "テスト配信",
    description: "動作確認用の配信ルーム",
  },
  {
    name: "game_room",
    title: "ゲーム配信",
    description: "ゲーム配信用ルーム",
  },
  {
    name: "study_room",
    title: "学習配信",
    description: "勉強・作業配信用ルーム",
  },
];

export default function StreamsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">配信一覧</h1>

      <div className="grid gap-4">
        {rooms.map((room) => (
          <Link
            key={room.name}
            href={`/streams/${room.name}`}
            className="block rounded-lg border border-zinc-700 bg-zinc-900 p-5 hover:bg-zinc-800"
          >
            <h2 className="text-xl font-semibold">{room.title}</h2>
            <p className="text-zinc-400 mt-2">{room.description}</p>
            <p className="text-sm text-zinc-500 mt-3">
              room: {room.name}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}