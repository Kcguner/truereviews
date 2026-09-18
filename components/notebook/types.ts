export interface NbTone {
  pos: number;
  neu: number;
  neg: number;
}

export interface NbTheme {
  topic: string;
  count: number;
  example?: string;
}

export interface NbReport {
  score: number; // 0-10
  summary: string;
  top_complaints: NbTheme[];
  top_praises: NbTheme[];
  action_suggestion: string;
  review_count: number;
  business_name: string;
  rating_histogram?: NbTone;
}

export interface NbPreview {
  score: number;
  teaser: string;
  business_name: string;
  review_count: number;
  tone?: NbTone;
}

export function bandOf(score100: number): 'a' | 'b' | 'c' | 'd' {
  if (score100 >= 85) return 'a';
  if (score100 >= 70) return 'b';
  if (score100 >= 55) return 'c';
  return 'd';
}

export function bandColor(score100: number): string {
  if (score100 >= 85) return 'var(--moss)';
  if (score100 >= 70) return 'var(--amber)';
  if (score100 >= 55) return '#C97A18';
  return 'var(--clay)';
}
