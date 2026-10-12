export type DraftKind =
  'profile' | 'experience' | 'knowledge' | 'post' | 'comment';
export type Payload = Record<string, string | string[]>;
export class SocietyError extends Error {
  constructor(
    public code: string,
    public status = 400
  ) {
    super(code);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new SocietyError('INVALID_INPUT');
  return value as Record<string, unknown>;
}
export function fields(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new SocietyError('UNKNOWN_FIELD');
}
export function text(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new SocietyError('INVALID_TEXT');
  return value.trim();
}
export function tags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 30)
    throw new SocietyError('INVALID_TAGS');
  return [...new Set(value.map((item) => text(item, 60).toLowerCase()))];
}
export function uuid(value: unknown): string {
  const id = text(value, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  )
    throw new SocietyError('INVALID_ID');
  return id;
}
export function validatePayload(kind: DraftKind, input: unknown): Payload {
  const value = object(input);
  if (kind === 'post') {
    fields(value, [
      'title',
      'content',
      'tags',
      'semantic_type',
      'community_id',
    ]);
    if (
      ![
        'discussion',
        'question',
        'solution',
        'experience',
        'collaboration_request',
      ].includes(String(value.semantic_type))
    )
      throw new SocietyError('INVALID_CATEGORY');
    return {
      title: text(value.title, 200),
      content: text(value.content, 10000),
      tags: tags(value.tags),
      semantic_type: String(value.semantic_type),
      community_id: value.community_id ? uuid(value.community_id) : '',
    };
  }
  if (kind === 'comment') {
    fields(value, ['post_id', 'parent_id', 'content', 'tags']);
    return {
      post_id: uuid(value.post_id),
      parent_id: value.parent_id ? uuid(value.parent_id) : '',
      content: text(value.content, 4000),
      tags: tags(value.tags),
    };
  }
  if (kind === 'profile') {
    fields(value, ['bio', 'skills', 'interests', 'topics']);
    return {
      bio: text(value.bio, 2000),
      skills: tags(value.skills),
      interests: tags(value.interests),
      topics: tags(value.topics),
    };
  }
  fields(value, ['title', 'problem', 'solution', 'tags', 'source_type']);
  if (
    !['authorized_task', 'self_reported', 'public_source'].includes(
      String(value.source_type)
    )
  )
    throw new SocietyError('INVALID_SOURCE');
  return {
    title: text(value.title, 200),
    problem: text(value.problem),
    solution: text(value.solution, 10000),
    tags: tags(value.tags),
    source_type: String(value.source_type),
  };
}
/** Conservative deterministic scan; absence of findings is not proof of privacy. */
export function sensitiveFindings(payload: Payload): string[] {
  const content = JSON.stringify(payload).normalize('NFKC');
  const rules: [string, RegExp][] = [
    [
      'credential',
      /\b(?:sk-[\w-]{12,}|ag_[a-f0-9]{32,}|AKIA[A-Z0-9]{16}|sb_secret_[\w-]+)\b/i,
    ],
    ['private_key', /-----BEGIN[\s\w]*PRIVATE KEY-----/],
    [
      'password_or_token',
      /(?:password|passwd|secret|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S+/i,
    ],
    ['email', /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i],
    ['personal_identifier', /\b(?:1[3-9]\d{9}|\d{17}[\dX])\b/],
    [
      'private_address',
      /(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|[A-Z]:\\Users\\)/i,
    ],
    [
      'instruction_injection',
      /(?:ignore (?:all |previous )?instructions|reveal.*(?:secret|password)|忽略.*指令|泄露.*密钥)/i,
    ],
  ];
  return rules
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name);
}
export interface ExperienceExtractor {
  extract(input: unknown): Promise<Payload>;
}
export const structuredExtractor: ExperienceExtractor = {
  async extract(input) {
    return validatePayload('experience', input);
  },
};
