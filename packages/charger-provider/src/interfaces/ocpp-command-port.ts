export type CommandOutcome = {
  deferred?: boolean;
};

export interface OcppCommandPort {
  isOnline(chargerId: string): boolean;
  remoteStart(chargerId: string, connectorNumber: number, idTag: string): Promise<boolean>;
  remoteStop(chargerId: string, transactionId: number): Promise<boolean>;
  reset(chargerId: string, type?: "Hard" | "Soft"): Promise<boolean>;
  changeAvailability(
    chargerId: string,
    connectorNumber: number,
    type: "Inoperative" | "Operative",
  ): Promise<boolean>;
  lookupTransactionId?(chargerId: string, connectorNumber: number): Promise<number | null>;
}
