import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalAssetStorage} from '../src/infrastructure/storage.ts';

const PNG=Buffer.from('89504e470d0a1a0a0000000d49484452','hex'); // PNG magic + IHDR 시작
const JPEG=Buffer.from('ffd8ffe000104a4649460001','hex');
const withDir=async(run:(dir:string)=>Promise<void>)=>{const dir=await mkdtemp(join(tmpdir(),'ep-assets-'));try{await run(dir)}finally{await rm(dir,{recursive:true,force:true})}};

test('허용 이미지를 저장하고 URL·크기를 반환한다',async()=>{await withDir(async dir=>{
 const storage=new LocalAssetStorage(dir);
 const saved=await storage.save(PNG,'image/png');
 assert.match(saved.url,/^\/uploads\/\d+-[0-9a-f]{8}\.png$/);
 assert.equal(saved.size,PNG.length);
 assert.equal(saved.contentType,'image/png');
 const files=await readdir(dir);
 assert.equal(files.length,1);
 const back=await storage.read(saved.filename);
 assert.equal(back.contentType,'image/png');
 assert.deepEqual(back.data,PNG);
})});

test('content-type 파라미터를 정규화하고 jpeg를 허용한다',async()=>{await withDir(async dir=>{
 const saved=await new LocalAssetStorage(dir).save(JPEG,'image/jpeg; charset=binary');
 assert.match(saved.url,/\.jpg$/);
})});

test('미지원 형식·빈 파일·매직바이트 불일치를 거부한다',async()=>{await withDir(async dir=>{
 const storage=new LocalAssetStorage(dir);
 await assert.rejects(()=>storage.save(PNG,'application/pdf'),(e:any)=>e.code==='UNSUPPORTED_MEDIA_TYPE'&&e.status===415);
 await assert.rejects(()=>storage.save(Buffer.alloc(0),'image/png'),(e:any)=>e.code==='EMPTY_UPLOAD');
 await assert.rejects(()=>storage.save(Buffer.from('not-an-image-at-all!!'),'image/png'),(e:any)=>e.code==='INVALID_IMAGE');
})});

test('경로 탈출·미존재 파일 읽기를 차단한다',async()=>{await withDir(async dir=>{
 const storage=new LocalAssetStorage(dir);
 await assert.rejects(()=>storage.read('../secret.png'),(e:any)=>e.code==='ASSET_NOT_FOUND'&&e.status===404);
 await assert.rejects(()=>storage.read('nope.png'),(e:any)=>e.code==='ASSET_NOT_FOUND');
 await assert.rejects(()=>storage.read('note.txt'),(e:any)=>e.code==='ASSET_NOT_FOUND');
})});
