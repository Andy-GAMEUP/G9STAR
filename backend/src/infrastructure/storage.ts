import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join,extname,basename} from 'node:path';
import {DomainError} from '../domain.ts';

// 지원 이미지 형식과 확장자. content-type -> ext.
const ALLOWED:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif'};
const MAX_BYTES=Number(process.env.ASSET_MAX_BYTES||8*1024*1024);

// 선언된 content-type과 실제 매직바이트가 일치하는지 검증한다(확장자 위조 방지).
const matchesMagic=(buffer:Buffer,contentType:string)=>{
 if(buffer.length<12)return false;
 if(contentType==='image/png')return buffer[0]===0x89&&buffer[1]===0x50&&buffer[2]===0x4e&&buffer[3]===0x47;
 if(contentType==='image/jpeg')return buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
 if(contentType==='image/gif')return buffer[0]===0x47&&buffer[1]===0x49&&buffer[2]===0x46&&buffer[3]===0x38;
 if(contentType==='image/webp')return buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP';
 return false;
};

export interface StoredAsset{filename:string;url:string;size:number;contentType:string}

// 로컬/자체 스토리지 구현. 정식 퍼블리싱 시 서버 스토리지(오브젝트 스토리지/Strapi)로 교체 예정.
// 교체 시 이 클래스만 동일 인터페이스로 갈아끼우면 된다.
export class LocalAssetStorage{
 dir:string;
 constructor(dir=process.env.ASSET_STORAGE_DIR||join(process.cwd(),'uploads')){this.dir=dir}
 async ensure(){if(!existsSync(this.dir))await mkdir(this.dir,{recursive:true})}
 async save(buffer:Buffer,contentType:string):Promise<StoredAsset>{
  const type=(contentType||'').split(';')[0].trim().toLowerCase(),ext=ALLOWED[type];
  if(!ext)throw new DomainError('UNSUPPORTED_MEDIA_TYPE',`지원하지 않는 이미지 형식입니다: ${type||'unknown'}`,415,{allowed:Object.keys(ALLOWED)});
  if(!buffer.length)throw new DomainError('EMPTY_UPLOAD','업로드된 파일이 비어 있습니다.',422);
  if(buffer.length>MAX_BYTES)throw new DomainError('PAYLOAD_TOO_LARGE',`이미지는 ${Math.floor(MAX_BYTES/1024/1024)}MB 이하여야 합니다.`,413,{maxBytes:MAX_BYTES});
  if(!matchesMagic(buffer,type))throw new DomainError('INVALID_IMAGE','이미지 내용이 선언한 형식과 일치하지 않습니다.',422,{contentType:type});
  await this.ensure();
  const filename=`${Date.now()}-${randomUUID().slice(0,8)}${ext}`;
  await writeFile(join(this.dir,filename),buffer);
  return{filename,url:`/uploads/${filename}`,size:buffer.length,contentType:type};
 }
 async read(name:string):Promise<{data:Buffer;contentType:string}>{
  const safe=basename(name);
  if(!safe||safe!==name)throw new DomainError('ASSET_NOT_FOUND','에셋을 찾을 수 없습니다.',404);
  const ext=extname(safe).toLowerCase(),type=Object.entries(ALLOWED).find(([,candidate])=>candidate===ext)?.[0];
  if(!type)throw new DomainError('ASSET_NOT_FOUND','에셋을 찾을 수 없습니다.',404);
  const path=join(this.dir,safe);
  if(!existsSync(path))throw new DomainError('ASSET_NOT_FOUND','에셋을 찾을 수 없습니다.',404);
  return{data:await readFile(path),contentType:type};
 }
}
