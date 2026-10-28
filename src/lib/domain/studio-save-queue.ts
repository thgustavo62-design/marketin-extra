export type StudioSaveResult =
  | { ok: true; revision: number }
  | { ok: false; error: string; conflict?: boolean; retryable?: boolean };
export type StudioSaveState = {
  status: "Salvo" | "Alterações pendentes" | "Salvando…" | "Não salvo";
  error: string;
  conflict: boolean;
  retryable: boolean;
  revision: number;
  pending: string | null;
};
// One writer per document. Newer edits replace pending work, never in-flight work.
export class StudioSaveQueue {
  private pending: string | null = null;
  private saved: string | null = null;
  private retryDocument: string | null = null;
  private running: Promise<boolean> | null = null;
  private blocked = false;
  private state: StudioSaveState;
  private send: (json: string, revision: number) => Promise<StudioSaveResult>;
  private changed: (state: StudioSaveState) => void;
  constructor(
    revision: number,
    send: (json: string, revision: number) => Promise<StudioSaveResult>,
    changed: (state: StudioSaveState) => void,
  ) {
    this.send = send;
    this.changed = changed;
    this.state = {
      status: "Salvo",
      error: "",
      conflict: false,
      retryable: false,
      revision,
      pending: null,
    };
  }
  get snapshot() {
    return { ...this.state, pending: this.pending };
  }
  get dirty() {
    return this.pending !== null || this.running !== null;
  }
  private emit(patch: Partial<StudioSaveState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.snapshot);
  }
  enqueue(json: string) {
    if (json === this.saved && !this.running && this.retryDocument === null) {
      this.pending = null;
      this.emit({ status: "Salvo", error: "", retryable: false });
      return;
    }
    this.pending = json;
    this.emit({ status: this.blocked ? "Não salvo" : "Alterações pendentes" });
  }
  flush(): Promise<boolean> {
    if (this.running) return this.running;
    if (this.blocked) return Promise.resolve(false);
    if (this.pending === null) return Promise.resolve(true);
    // Assign the promise before calling the transport, including synchronous failures.
    const job = Promise.resolve().then(async () => {
      while (
        (this.pending !== null || this.retryDocument !== null) &&
        !this.blocked
      ) {
        const retrying = this.retryDocument !== null;
        const json = this.retryDocument ?? this.pending!;
        this.retryDocument = null;
        if (!retrying) this.pending = null;
        this.emit({ status: "Salvando…", error: "" });
        let result: StudioSaveResult;
        try {
          result = await this.send(json, this.state.revision);
        } catch {
          result = {
            ok: false,
            retryable: true,
            error:
              "Sem conexão. Sua edição continua aberta. Tentaremos salvar novamente.",
          };
        }
        if (!result.ok) {
          if (this.pending === null) this.pending = json;
          if (result.retryable) this.retryDocument = json;
          this.blocked = !!result.conflict;
          this.emit({
            status: "Não salvo",
            error: result.error,
            conflict: this.blocked,
            retryable: !!result.retryable,
          });
          return false;
        }
        this.saved = json;
        if (this.pending === json) this.pending = null;
        this.emit({
          revision: result.revision,
          status: this.pending ? "Alterações pendentes" : "Salvo",
          error: "",
          retryable: false,
        });
      }
      return true;
    });
    this.running = job;
    void job.finally(() => {
      this.running = null;
    });
    return job;
  }
}
