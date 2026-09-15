import { HttpException } from '@nestjs/common';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/** 批量删除请求体 */
export class BatchDeleteDto {
  @ApiProperty({ type: [String], description: '要删除的 ID 列表' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @Type(() => String)
  ids!: string[];
}

export type BatchDeleteFailure = {
  id: string;
  message: string;
};

export type BatchDeleteResult = {
  /** 成功删除数 */
  deleted: number;
  /** 失败数 */
  failed: number;
  /** 失败明细 */
  failures: BatchDeleteFailure[];
};

function errorMessage(e: unknown): string {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    if (typeof r === 'string') return r;
    if (r && typeof r === 'object' && 'message' in r) {
      const m = (r as { message?: string | string[] }).message;
      if (Array.isArray(m)) return m.join('; ');
      if (typeof m === 'string') return m;
    }
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * 逐条调用 removeOne；单条失败不中断整批。
 * 去重、去空；适合有业务校验（关联限制）的删除。
 */
export async function runBatchRemove(
  ids: string[],
  removeOne: (id: string) => Promise<unknown>,
): Promise<BatchDeleteResult> {
  const unique = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  let deleted = 0;
  let failed = 0;
  const failures: BatchDeleteFailure[] = [];

  for (const id of unique) {
    try {
      await removeOne(id);
      deleted += 1;
    } catch (e) {
      failed += 1;
      failures.push({ id, message: errorMessage(e) });
    }
  }

  return { deleted, failed, failures };
}
