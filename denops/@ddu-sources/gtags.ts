import {
    BaseSource, 
    DduOptions, 
    Item, 
    SourceOptions,
} from "https://deno.land/x/ddu_vim@v3.5.0/types.ts";
import { Denops, fn } from "https://deno.land/x/ddu_vim@v3.5.0/deps.ts";
import { treePath2Filename } from "https://deno.land/x/ddu_vim@v3.5.0/utils.ts";
import { ActionData } from "https://deno.land/x/ddu_kind_file@v0.5.3/file.ts";
import { BufReader } from "https://deno.land/std@0.198.0/io/buffer.ts";
import { resolve } from "https://deno.land/std@0.198.0/path/mod.ts";
import { abortable } from "https://deno.land/std@0.198.0/async/mod.ts";
import { TextLineStream } from "https://deno.land/std@0.198.0/streams/mod.ts";

const enqueueSize1st = 1000;

type Params = {
    args: string;
    input: string;
    path: string;
};

async function* iterLine(r: ReadableStream<Uint8Array>): AsyncIterable<string> {
    const lines = r
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

  for await (const line of lines) {
      if ((line as string).length) {
          yield line as string;
    }
  }
}

export class Source extends BaseSource<Params> {
    kind = "file";

    gather(args: {
        denops: Denops;
        options: DduOptions;
        sourceParams: Params;
        input: string;
    }): ReadableStream<Item<ActionData>[]> {
        const abortController = new AbortController();

        const re = /^(\S+)\s+(\d+)\s+(.*)$/;
        const parse_line = (line: string, cwd: string) => {
            line = line.trim();
            const result = line.match(re);
            const get_param = (ary: string[], index: number) => {
                return ary[index] ?? "";
            };

            const path = result ? get_param(result, 1) : "";
            const lineNr = result ? Number(get_param(result, 2)) : 0;
            const col = 0;
            const text = result ? get_param(result, 3) : "";

            return {
                word: text,
                display: line,
                action: {
//                    path: join(cwd, path),
                    path: path ? resolve(cwd, path) : "",
                    lineNr,
                    text,
                },
            };
        };

        return new ReadableStream({
            async start(controller) {
                const input = args.sourceOptions.volatile
                    ? args.input
                    : args.sourceParams.input;

                if (input == "" && args.sourceParams.args != "-u") {
                    controller.close();
                    return;
                }

                const cmd = (args.sourceParams.args == "-u")
                    ? ["global", args.sourceParams.args]
                    : ["global", "--result=ctags-mod", args.sourceParams.args, input];

                const cwd = args.sourceOptions.path.length !== 0
                    ? treePath2Filename(args.sourceOptions.path)
                    : await fn.getcwd(args.denops) as string;

                let items: Item<ActionData>[] = [];
                const enqueueSize2nd = 100000;
                let enqueueSize = enqueueSize1st;
                let numChunks = 0;

                const proc = new Deno.Command(
                    cmd[0],
                    {
                        args: cmd.slice(1),
                        stdout: "piped",
                        stderr: "piped",
                        stdin: "null",
                        cwd,
                    },
                ).spawn();

                try {
                    for await (
                        const line of abortable(
                            iterLine(proc.stdout),
                            abortController.signal,
                        )
                    ) {
                        items.push(parse_line(line, cwd));
                        if (items.length >= enqueueSize) {
                            numChunks++;
                            if (numChunks > 1) {
                                enqueueSize = enqueueSize2nd;
                            }
                            controller.enqueue(items);
                            items = [];
                        }
                    }
                    if (items.length) {
                        controller.enqueue(items);
                    }
                } catch (e: unknown) {
                    if (e instanceof DOMException) {
                        proc.kill("SIGTERM");
                    } else {
                        console.error(e);
                    }
                } finally {
                    for await (
                        const mes of abortable(
                            iterLine(proc.stderr),
                            abortController.signal,
                        )
                    ) {
                        console.error(mes);
                    }

                    controller.close();
                }
            },

            cancel(reason): void {
                abortController.abort(reason);
            },
        });
    }

    params(): Params {
        return {
            args: "-d",
            input: "",
            path: "",
        };
    }
}
