import {validateImage} from '../backend/src/infrastructure/storage.ts';
import {DomainError} from '../backend/src/domain.ts';
export class R2AssetStorage{
 constructor(privateBucket:any){this.bucket=privateBucket}private bucket:any;
 async ensure(){}
 async save(buffer:Buffer,contentType:string){const {type,ext}=validateImage(buffer,contentType),filename=crypto.randomUUID()+ext;await this.bucket.put(filename,buffer,{httpMetadata:{contentType:type}});return{filename,url:'/uploads/'+filename,size:buffer.length,contentType:type}}
 async read(name:string){if(!/^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/.test(name))throw new DomainError('ASSET_NOT_FOUND','이미지를 찾을 수 없습니다.',404);const object=await this.bucket.get(name);if(!object)throw new DomainError('ASSET_NOT_FOUND','이미지를 찾을 수 없습니다.',404);return{data:Buffer.from(await object.arrayBuffer()),contentType:object.httpMetadata?.contentType||'application/octet-stream'}}
}
