import { PRO_MODELS } from '../oracle.js';
export function shouldDetachSession({ 
// Params kept for future policy tweaks; currently only model/disableDetachEnv matter.
engine: _engine, model, waitPreference: _waitPreference, disableDetachEnv, }) {
    if (disableDetachEnv)
        return false;
    // Only Pro-tier API runs should start detached by default; browser runs stay inline so failures surface.
    if (PRO_MODELS.has(model) && _engine === 'api')
        return true;
    return false;
}
