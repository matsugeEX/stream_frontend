import ViewerClient from "./ViewerClient";

type Props = {
  params: Promise<{
    roomName: string;
  }>;
};

export default async function ViewerPage({ params }: Props) {
  const { roomName } = await params;

  return <ViewerClient roomName={roomName} />;
}