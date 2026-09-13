import test from 'node:test';
import assert from 'node:assert/strict';
import {booleanField,integerField,isoDateTimeField,stringField} from '../src/input-validation.ts';
import {DomainError} from '../src/domain.ts';

const code=(work:()=>unknown)=>assert.throws(work,(error:DomainError)=>error.code==='VALIDATION_ERROR'&&error.status===422);
test('문자열 입력을 trim하고 길이를 검증한다',()=>{assert.equal(stringField({code:'  RS-A001-KIM  '},'code'),'RS-A001-KIM');code(()=>stringField({code:''},'code'))});
test('금액 입력은 0 이상의 안전한 정수만 허용한다',()=>{assert.equal(integerField({amount:0},'amount'),0);code(()=>integerField({amount:-1},'amount'));code(()=>integerField({amount:1.5},'amount'))});
test('boolean과 ISO 일시의 타입을 엄격히 검증한다',()=>{assert.equal(booleanField({success:false},'success'),false);code(()=>booleanField({success:'false'},'success'));assert.equal(isoDateTimeField({at:'2026-10-01T00:00:00+09:00'},'at'),'2026-10-01T00:00:00+09:00');code(()=>isoDateTimeField({at:'2026-10-01'},'at'))});
