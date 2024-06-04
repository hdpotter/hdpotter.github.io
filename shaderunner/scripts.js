const GRID_SIZE = 32;
const UPDATE_INTERVAL = 400;
const WORKGROUP_SIZE = 8;

const canvas = document.querySelector("canvas");

if(!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
if(!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();
if(!device) {
    throw new Error("Device request failed.");
}

const context = canvas.getContext("webgpu");
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});

const vertices = new Float32Array([
      -0.8, -0.8,
       0.8, -0.8,
       0.8,  0.8,
    
      -0.8, -0.8,
       0.8,  0.8,
      -0.8,  0.8,
    ]);
const vertexBuffer = device.createBuffer({
    label: "cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(vertexBuffer, 0, vertices);

const vertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0,
    }],
};


const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
    label: "grid uniforms",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);


const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

const cellStateStorage = [
    device.createBuffer({
        label: "cell state",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
        label: "cell state b",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
];

for (let i = 0; i < cellStateArray.length; i++) {
    cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

// for (let i = 0; i < cellStateArray.length; i += 1) {
//     cellStateArray[i] = i % 2;
// }
// device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);


const shaderCode = await fetch('shader.wgsl').then(response => response.text());
const cellShaderModule = device.createShaderModule({
    label: "cell shader",
    code: shaderCode,
});

const simulationShaderCode = await fetch('compute_shader.wgsl').then(response => response.text());
const simulationShaderModule = device.createShaderModule({
    label: "simulation shader",
    code: simulationShaderCode,
});


const bindGroupLayout = device.createBindGroupLayout({
    label: "cell bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
        buffer: {},
    }, {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
    }, {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
    }]
});


const pipelineLayout = device.createPipelineLayout({
    label: "cell pipeline layout",
    bindGroupLayouts: [ bindGroupLayout ],
})


const cellPipeline = device.createRenderPipeline({
    label: "cell pipeline",
    layout: pipelineLayout,
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertex_main",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragment_main",
        targets: [{
            format: canvasFormat,
        }]
    }
});

const simulationPipeline = device.createComputePipeline({
    label: "simulation pipeline",
    layout: pipelineLayout,
    compute: {
        module: simulationShaderModule,
        entryPoint: "compute_main",
    }
})

const bindGroups = [
    device.createBindGroup({
        label: "cell renderer bind group a",
        layout: cellPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer },
        }, {
            binding: 1,
            resource: { buffer: cellStateStorage[0] },
        }, {
            binding: 2,
            resource: { buffer: cellStateStorage[1] },
        }],
    }),
    device.createBindGroup({
        label: "cell renderer bind group b",
        layout: cellPipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: { buffer: uniformBuffer },
        }, {
            binding: 1,
            resource: { buffer: cellStateStorage[1] },
        }, {
            binding: 2,
            resource: { buffer: cellStateStorage[0] },
        }],
    })
];

let step = 0;

function updateGrid() {

    const encoder = device.createCommandEncoder();


    const computePass = encoder.beginComputePass();

    computePass.setPipeline(simulationPipeline);
    computePass.setBindGroup(0, bindGroups[step % 2]);

    const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

    computePass.end();

    step++;

    
    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0.1, g: 0, b: 0.2, a: 1 },
            storeOp: "store",
        }]
    });
    
    pass.setPipeline(cellPipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, bindGroups[step % 2]);
    
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);
    
    pass.end();
    
    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
}

setInterval(updateGrid, UPDATE_INTERVAL);







