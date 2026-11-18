import { tuning } from '../config';
import { contentKey, freshSummary, noteText, type NoteRecord } from '../sync/noteRecord';

/** 요약할 노트 내용 */
export interface SummaryInput {
  title?: string;
  text: string;
}

/** 노트 하나를 요약한다. 실패하면 SummaryError 를 던진다 */
export type Summarize = (note: SummaryInput) => Promise<string>;

/**
 * 요약 실패. skipNote 면 그 노트만 이번 실행 동안 건너뛰고 다음 노트로 간다(거절, 빈 답).
 * 아니면(키 오류, 요청 한도, 연결 실패) 이번 차례를 멈추고 다음 차례에 다시 해 본다
 */
export class SummaryError extends Error {
  constructor(
    message: string,
    readonly skipNote: boolean,
  ) {
    super(message);
  }
}

/** 요약이 필요한 노트인지: 지우지 않은 메모·문서이고 글이 album.summary.minChars 자 이상인데 지금 글로 만든 요약이 없다 */
export function needsSummary(record: NoteRecord): boolean {
  if (record.deleted || (record.kind !== 'memo' && record.kind !== 'doc')) return false;
  if ((noteText(record)?.length ?? 0) < tuning.album.summary.minChars) return false;
  return freshSummary(record) === undefined;
}

/** 요약 차례가 다루는 앨범 쪽 동작 */
export interface SummaryTarget {
  liveRecords(): NoteRecord[];
  setSummary(id: string, text: string, source: string): Promise<NoteRecord | undefined>;
}

export interface SummaryStatus {
  /** 요약을 기다리는 노트 수 */
  pending: number;
  running: boolean;
  /** 이번 실행에서 만든 요약 수 */
  done: number;
  /** 마지막 실패 글. 성공하면 지운다 */
  error: string | null;
}

/**
 * 요약이 필요한 노트를 최근 것부터 하나씩 요약해 앨범에 적는다. 한 차례에 album.summary.perRun 개까지 한다.
 * 언제 차례를 돌릴지는 부르는 쪽이 정한다(앱을 열 때, 저장한 뒤, 주기적으로)
 */
export class SummaryRunner {
  private running = false;
  private done = 0;
  private error: string | null = null;
  /** 건너뛴 노트(번호와 글 지문). 글이 바뀌면 다시 해 본다 */
  private readonly skipped = new Set<string>();

  constructor(
    private readonly target: SummaryTarget,
    private readonly summarize: Summarize,
    /** 요약을 적었을 때 부른다. 화면의 카드를 바꾼다 */
    private readonly onSummary: (id: string, text: string) => void = () => {},
    /** 상태가 바뀔 때 부른다. 설정 화면이 보인다 */
    private readonly onStatus: (status: SummaryStatus) => void = () => {},
  ) {}

  status(): SummaryStatus {
    return { pending: this.candidates().length, running: this.running, done: this.done, error: this.error };
  }

  /** 한 차례 돌리고 만든 요약 수를 돌려준다. 이미 도는 중이면 0 */
  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    this.emit();
    let made = 0;
    try {
      for (const record of this.candidates().slice(0, tuning.album.summary.perRun)) {
        const source = contentKey(record);
        try {
          const text = (await this.summarize({ title: record.title, text: noteText(record) ?? '' })).trim();
          if (!text) throw new SummaryError('빈 요약이 왔다', true);
          if (await this.target.setSummary(record.id, text, source)) {
            made++;
            this.done++;
            this.error = null;
            this.onSummary(record.id, text);
          }
        } catch (err) {
          this.error = err instanceof Error ? err.message : String(err);
          if (err instanceof SummaryError && err.skipNote) this.skipped.add(`${record.id}:${source}`);
          else break;
        } finally {
          this.emit();
        }
      }
    } finally {
      this.running = false;
      this.emit();
    }
    return made;
  }

  private candidates(): NoteRecord[] {
    return this.target
      .liveRecords()
      .filter((r) => needsSummary(r) && !this.skipped.has(`${r.id}:${contentKey(r)}`))
      .sort((a, b) => b.time - a.time);
  }

  private emit(): void {
    this.onStatus(this.status());
  }
}
