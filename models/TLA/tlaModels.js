import { mainDB, backup1, backup2 } from '../../database/mongo-dbconnect.js';
import { tlaSchema }               from './tla.js';
import { tlaApprovalStatusSchema } from './tlaApprovalStatus.js';
import { preDigitalSessionSchema } from './tlaPreDigitalSession.js';
import { postDigitalSessionSchema } from './tlaPostDigitalSession.js';

// Helper: get or create a model on a connection
function getModel(conn, name, schema) {
    return conn.models[name] || conn.model(name, schema);
}

// TLA
const TLA_Main = getModel(mainDB, 'TLA', tlaSchema);
const TLA_B1   = getModel(backup1, 'TLA', tlaSchema);
const TLA_B2   = getModel(backup2,  'TLA', tlaSchema);

// TLAApprovalStatus
const Status_Main = getModel(mainDB, 'TLAApprovalStatus', tlaApprovalStatusSchema);
const Status_B1   = getModel(backup1, 'TLAApprovalStatus', tlaApprovalStatusSchema);
const Status_B2   = getModel(backup2,  'TLAApprovalStatus', tlaApprovalStatusSchema);

// PreDigitalSession
const Pre_Main = getModel(mainDB, 'PreDigitalSession', preDigitalSessionSchema);
const Pre_B1   = getModel(backup1, 'PreDigitalSession', preDigitalSessionSchema);
const Pre_B2   = getModel(backup2,  'PreDigitalSession', preDigitalSessionSchema);

// PostDigitalSession
const Post_Main = getModel(mainDB, 'PostDigitalSession', postDigitalSessionSchema);
const Post_B1   = getModel(backup1, 'PostDigitalSession', postDigitalSessionSchema);
const Post_B2   = getModel(backup2,  'PostDigitalSession', postDigitalSessionSchema);

export {
    TLA_Main,   TLA_B1,   TLA_B2,
    Status_Main,Status_B1,Status_B2,
    Pre_Main,   Pre_B1,   Pre_B2,
    Post_Main,  Post_B1,  Post_B2
};
