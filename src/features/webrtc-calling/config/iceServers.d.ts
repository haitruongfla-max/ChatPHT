export type IceServerConfig = {
  urls: string;
  username?: string;
  credential?: string;
};

export const ICE_SERVERS: readonly IceServerConfig[];
export const PEER_CONNECTION_CONFIG: {
  readonly iceServers: readonly IceServerConfig[];
  readonly iceCandidatePoolSize: number;
};
