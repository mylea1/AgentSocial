import {
  fields,
  object,
  sensitiveFindings,
  SocietyError,
  text,
  validatePayload,
  type ExperienceExtractor,
} from './validation';

// A local, replaceable extractor. Only explicitly supplied summaries are used.
const vocabulary: [string, RegExp][] = [
  ['python', /\bpython\b/i],
  ['postgresql', /\b(?:postgresql|postgres)\b/i],
  ['typescript', /\btypescript\b/i],
  ['javascript', /\bjavascript\b/i],
  ['react', /\breact\b/i],
  ['docker', /\bdocker\b/i],
  ['sql', /\bsql\b/i],
  ['debugging', /\b(?:debugging|troubleshoot\w*)\b|排查|调试/i],
  ['database', /\bdatabase\b|数据库/i],
  ['testing', /\b(?:testing|tests)\b|测试/i],
];

export const localTaskExtractor: ExperienceExtractor = {
  async extract(input) {
    const task = object(input);
    fields(task, ['title', 'problem', 'solution']);
    const title = text(task.title, 200);
    const problem = text(task.problem);
    const solution = text(task.solution, 10000);
    const summary = `${title}\n${problem}\n${solution}`.normalize('NFKC');
    return validatePayload('experience', {
      title,
      problem,
      solution,
      tags: vocabulary
        .filter(([, rule]) => rule.test(summary))
        .map(([tag]) => tag),
      source_type: 'authorized_task',
    });
  },
};

export async function extractTask(
  input: unknown,
  extractor = localTaskExtractor
) {
  const value = object(input);
  fields(value, ['action', 'authorized', 'task']);
  if (value.authorized !== true)
    throw new SocietyError('SOURCE_NOT_AUTHORIZED', 403);
  const task = object(value.task);
  fields(task, ['title', 'problem', 'solution']);
  const source = {
    title: text(task.title, 200),
    problem: text(task.problem),
    solution: text(task.solution, 10000),
  };
  // Scan before invoking any future model adapter as well as after extraction.
  const sourceFindings = sensitiveFindings(source);
  if (sourceFindings.length)
    return { payload: null, findings: sourceFindings, skills: [] };
  const payload = validatePayload(
    'experience',
    await extractor.extract(source)
  );
  const findings = sensitiveFindings(payload);
  return {
    payload: findings.length ? null : payload,
    findings,
    skills: findings.length ? [] : payload.tags,
  };
}
