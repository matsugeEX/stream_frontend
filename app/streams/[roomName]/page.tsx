import StreamRoomClient from "./StreamRoomClient";

type Props = {
  params: Promise<{
    roomName: string;
  }>;
};

export default async function StreamRoomPage({ params }: Props) {
  const { roomName } = await params;

  return <StreamRoomClient roomName={roomName} />;
}