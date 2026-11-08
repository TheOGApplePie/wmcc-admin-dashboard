/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS regression runner. */
// Run with node scripts/test-instagram-requirements.cjs.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
function load(path) {
  const loadedModule = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', js)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { UpdateSocialPostZod } = load('app/schemas/socialCampaigns.ts');
const { assertImageRatio } = load('features/socialCampaigns/lib/imageDimensions.ts');
const base = { id: '00000000-0000-4000-8000-000000000000', version: 1, title: 'Post', caption: '', media_items: [{url:'https://example.com/image.jpg',alt_text:''}], hashtags: [], channel:'instagram_story', scheduled_date:'2027-01-01',time_slot:'morning',status:'scheduled' };
assert.equal(UpdateSocialPostZod.safeParse(base).success, true, 'Story needs neither caption nor alt text');
for (const channel of ['instagram_feed','instagram_reel']) {
  assert.equal(UpdateSocialPostZod.safeParse({...base,channel}).success,false,'Caption required');
  assert.equal(UpdateSocialPostZod.safeParse({...base,channel,caption:'Caption',media_items:[{url:'https://example.com/media',alt_text:'Description'}]}).success,true);
  assert.equal(UpdateSocialPostZod.safeParse({...base,channel,caption:'x'.repeat(2199),hashtags:['tag']}).success,false,'Combined caption length');
  assert.equal(UpdateSocialPostZod.safeParse({...base,channel,caption:'#tag '.repeat(31)}).success,false,'Inline hashtag count');
}
assert.equal(UpdateSocialPostZod.safeParse({...base,channel:'instagram_feed',caption:'Caption'}).success,false,'Feed alt text required');
assert.equal(UpdateSocialPostZod.safeParse({...base,media_items:[...base.media_items,...base.media_items]}).success,false,'One Story image');
assertImageRatio(1080,1920,'9:16');
assertImageRatio(1080,1350,'4:5');
assert.throws(()=>assertImageRatio(1080,1350,'9:16'));
assert.throws(()=>assertImageRatio(1080,1920,'4:5'));
console.log('Instagram schema and aspect-ratio regression checks passed.');

const whatsapp = {...base,channel:'whatsapp',caption:'Join us: https://example.com',media_items:[]};
assert.equal(UpdateSocialPostZod.safeParse(whatsapp).success,true,'WhatsApp text only');
assert.equal(UpdateSocialPostZod.safeParse({...whatsapp,caption:''}).success,false,'WhatsApp message required');
assert.equal(UpdateSocialPostZod.safeParse({...whatsapp,media_items:[{url:'https://example.com/storage/v1/object/public/event-posters/public/poster.jpg',alt_text:''}]}).success,true,'WhatsApp JPEG without alt text or ratio');
assert.equal(UpdateSocialPostZod.safeParse({...whatsapp,media_items:[{url:'https://example.com/storage/v1/object/public/videos/public/video.mp4',alt_text:''}]}).success,false,'WhatsApp video unsupported');
assert.equal(UpdateSocialPostZod.safeParse({...whatsapp,media_items:base.media_items}).success,false,'WhatsApp poster folder required');
console.log('WhatsApp schema regression checks passed.');

for (const obsolete of ["description", "media_url", "call_to_action_link", "call_to_action_caption"]) assert.equal(obsolete in UpdateSocialPostZod.parse(base), false);

const { getInstagramConfig } = load('features/socialCampaigns/instagram/config.ts');
const env = {INSTAGRAM_DEV_ACCOUNT_ID:'test',INSTAGRAM_DEV_ACCESS_TOKEN:'test-token',INSTAGRAM_PROD_ACCOUNT_ID:'live',INSTAGRAM_PROD_ACCESS_TOKEN:'live-token'};
assert.equal(getInstagramConfig({...env,NODE_ENV:'development'}).accountId,'test');
assert.equal(getInstagramConfig({...env,NODE_ENV:'production'}).accountId,'live');
assert.equal(getInstagramConfig({...env,NODE_ENV:'production',VERCEL_ENV:'preview'}).accountId,'test');
assert.equal(getInstagramConfig({...env,VERCEL_ENV:'production'}).seed,'live-token');
assert.equal(getInstagramConfig({INSTAGRAM_DEV_ACCESS_TOKEN:'test-token',VERCEL_ENV:'production'}).seed,undefined);
console.log('Instagram environment selection checks passed.');

assert.equal(getInstagramConfig({...env,INSTAGRAM_ENV:'dev',VERCEL_ENV:'production'}).accountId,'test');
assert.equal(getInstagramConfig({...env,INSTAGRAM_ENV:'prod',NODE_ENV:'development'}).accountId,'live');
assert.equal(getInstagramConfig({...env,INSTAGRAM_ENV:'',NODE_ENV:'development'}).accountId,'test');
assert.throws(()=>getInstagramConfig({...env,INSTAGRAM_ENV:'invalid'}),/INSTAGRAM_ENV/);
assert.equal(getInstagramConfig({INSTAGRAM_ENV:'prod',INSTAGRAM_DEV_ACCESS_TOKEN:'test-token'}).seed,undefined);
console.log('Explicit Instagram account override checks passed.');
