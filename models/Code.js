const Model = class {
    constructor(code) {
        let result;
        var code = new String(code);
        if (code.length < 5) {
            var fill = 6 - code.length;
            code = new Array(fill).join('0') + code;
        }
        if (Model.CODE[code]) {
            result = new Error(Model.CODE[code]);
            result.code = code;
        } else {
            code = '00000';
            result = new Error(Model.CODE[code]);
            result.code = code;
        }
        return result;
    }
};

Model.CODE = {
    '00000': 'unknown exception',
    '00001': 'timeout',
    '00002': 'command not found',
    '01001': 'DB write error',
    '01002': 'DB read error',
    '01003': 'DB update error',
    '01004': 'DB delete error',
    '10000': 'invalid input',
    '10001': 'invalid time format',
    '10002': 'invalid quality',
    '10003': 'invalid image format',
    '10004': 'invalid image width',
    '10101': 'invalid hashcash',
    '10201': 'invalid token',
    '10301': 'invalid verify code',
    '10601': 'invalid language',
    '12001': 'invalid email',
    '19100': 'invalid uid',
    '19101': 'incorrect account/password',
    '19102': 'invalid user data',
    '19103': 'incorrect old password',
    '19104': 'incorrect reset code',
    '19001': 'invalid source file',
    '19002': 'file size too small',
    '19003': 'not image file',
    '19004': 'file size too huge',
    '19005': 'not video file',
    '19006': 'not subtitle file',
    '19200': 'invalid program',
    '19201': 'invalid keyword',
    '19202': 'invalid pid',
    '19203': 'invalid publishStatus',
    '19204': 'invalid price',
    '19205': 'invalid title',
    '19206': 'invalid description',
    '19207': 'invalid releaseDate',
    '19208': 'invalid publish',
    '19209': 'invalid sourceId',
    '19210': 'invalid bangou',
    '19211': 'invalid cover',
    '19212': 'invalid thumbnail',
    '19213': 'invalid stream',
    '19214': 'invalid preview',
    '19215': 'invalid duration',
    '19216': 'invalid updatedAt',
    '19217': 'invalid source',
    '19218': 'too many sourceId',
    '19219': 'sourceId should not be empty',
    '19220': 'invalid unpublishAt',
    '19221': 'invalid promote',
    '19222': 'invalid index',
    '19223': 'invalid paymentDes',
    '19224': 'invalid subtitle',
    '19225': 'invalid banner',
    '19226': 'invalid payment plan',
    '19300': 'invalid point card',
    '19400': 'invalid point card',
    '19401': 'invalid transaction data',
    '19500': 'invalid tid',
    '19501': 'invalid tag type',
    '19502': 'invalid tag',
    '19600': 'invalid aid',
    '19601': 'invalid article',
    '19602': 'invalid content',
    '19700': 'invalid point card payload',
    '22001': 'occupied email',
	'29101': 'duplicate user data',
	'30601': 'plan point no found',
    '31000': 'only local database can run test',
	'39101': 'register data not found',
	'39102': 'user not found',
    '39201': 'program not found',
    '39202': 'without rejecton reason',
    '39501': 'tag not found',
    '39502': 'tag type not found',
	'39300': 'code not found',
    '39701': 'order not found',
    '39601': 'article not found',
    '39401': 'transaction not found',
    '42001': 'email quota exceeded',
	'40301': 'verification failed too many times',
	'49101': 'login failed too many times',
	'49102': 'reset failed too many times',
	'49201': 'not enough points',
    '49301': 'not enough reward points',
	'69101': 'user no permission to login',
	'70201': 'Overdue token',
    '88900': 'upload failed',
	'88901': 'Purchase plan size over the upper limit',
    '89000': 'delete failed',
    '99501': 'duplicate tag type',
    '99502': 'duplicate tag'
};

module.exports = Model;
