import { publicError } from '../security/limits';

let started = false;
// Stay alive until the supervisor reaps the entire process tree, including any
// orphan Chromium processes. Do not give this process the database connection.
process.on('message', (url: unknown) => {
  if (started || typeof url !== 'string') return;
  started = true;
  void import('../accessibility/scanner').then(({ performFullScan }) => performFullScan(url)).then(
    result => process.send?.({ result }),
    cause => { const error = publicError(cause); process.send?.({ error: { code: error.code, message: error.message } }); },
  );
});
